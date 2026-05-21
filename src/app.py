import json
import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.api_gateway import CORSConfig
from aws_lambda_powertools.event_handler import Response
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
import datetime 
from botocore.exceptions import ClientError
from decimal import Decimal
from os import getenv

cors = CORSConfig(allow_origin="*", allow_headers=["Content-Type", "X-Api-Key"])
app = APIGatewayRestResolver(cors=cors)
headers = {"Access-Control-Allow-Origin": "*"}
putRequestKeys = {
        "timeline": ["events", "eras", "expectedVersion"],
        "species": ["species", "expectedVersion"],
        "factions": ["factions", "expectedVersion"],
        "technology": ["technology", "expectedVersion"],
        "locations": ["locations", "expectedVersion"],
        "overview": ["overview", "expectedVersion"],
        "lore": ["lore", "expectedVersion"],
        "characters": ["characters", "expectedVersion"],
        "stories": ["stories", "expectedVersion"],
    }

putDynamoKeys = {
        'factions': ['factions', 'expectedVersion'],
        'locations': ['locations', 'expectedVersion'],
        'species': ['species', 'expectedVersion'],
        'technology': ['technology', 'expectedVersion'],
        'timeline': ['events', 'eras', 'expectedVersion'],
        'overview': ['overview', 'expectedVersion'],
        'lore': ['lore', 'expectedVersion'],
        'characters': ['characters', 'expectedVersion'],
        'stories': ['stories', 'expectedVersion'],
    }

getDynamoKeys = {
        'factions': ['factions', 'updatedAt', 'version'],
        'locations': ['locations', 'updatedAt', 'version'],
        'species': ['species', 'updatedAt', 'version'],
        'technology': ['technology', 'updatedAt', 'version'],
        'timeline': ['events', 'eras', 'updatedAt', 'version'],
        'overview': ['overview', 'updatedAt', 'version'],
        'lore': ['lore', 'updatedAt', 'version'],
        'characters': ['characters', 'updatedAt', 'version'],
        'stories': ['stories', 'updatedAt', 'version'],
    }

# Arrays of entities (each entry must have a unique `id`).
# `overview` is a single object, not an entity array, so it's excluded.
entityArrayKeys = {
        'timeline': ['events', 'eras'],
        'species': ['species'],
        'factions': ['factions'],
        'technology': ['technology'],
        'locations': ['locations'],
        'lore': ['lore'],
        'characters': ['characters'],
        'stories': ['stories'],
    }


tracer = Tracer()
logger = Logger()

@tracer.capture_method
def json_serializer(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    elif isinstance(obj, str):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable: {obj}")

def responseFormatter(status_code, responseBody):
    return Response(
        status_code=status_code,
        content_type="application/json",
        headers=headers,
        body=json.dumps(responseBody, default=json_serializer)
    )


def findDuplicateIds(payload: dict, module: str):
    """Return a list of {key, duplicates: [...]} for any entity array that has
    repeated `id` values or entries missing `id`. Empty list = clean."""
    problems = []
    for arrayKey in entityArrayKeys.get(module, []):
        arr = payload.get(arrayKey)
        if not isinstance(arr, list):
            continue
        seen = {}
        missingIds = []
        for idx, entry in enumerate(arr):
            if not isinstance(entry, dict):
                continue
            entryId = entry.get("id")
            if not entryId:
                missingIds.append(idx)
                continue
            seen.setdefault(entryId, []).append(idx)
        dupes = {eid: idxs for eid, idxs in seen.items() if len(idxs) > 1}
        if dupes or missingIds:
            problems.append({
                "key": arrayKey,
                "duplicates": dupes,
                "missingIds": missingIds,
            })
    return problems

@tracer.capture_method
def readFromDynamo(pk: str, module: str, world: str):
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(f"codex-{world}-{module}")
    dynamoGet = table.get_item(
        Key={
            'pk': pk
        }
    )
    data = dynamoGet.get("Item")
    try:
        assert data
    except AssertionError as e:
        logger.error(f"Read Error 1: {e}")
        logger.error(f"Module: {module}")
        logger.error(f"Table: codex-{world}-{module}")
        logger.error(f"pk: {pk}")
        responseBody = {
            "error": str(e)
        }
        return responseFormatter(404, responseBody)
    try:
        assert all(k in data.keys() for k in getDynamoKeys[module])
        responseBody = {k: data[k] for k in data.keys() if k != "pk"}
        responseBody["version"] = int(responseBody["version"])
        return responseFormatter(200, responseBody)
    except AssertionError as e:
        logger.error(f"Read error 2: {e}")
        logger.error(f"dynamo keys: {data.keys()}")
        logger.error(f"Module: {module}")
        logger.error(f"Table: codex-{world}-{module}")
        logger.error(f"pk: {pk}")
        responseBody = {
            "error": str(e)
        }
        return responseFormatter(500, responseBody)
    except:
        logger.error("Read error 3: Generic Reader Error")
        logger.error(f"data.keys: {data.keys()}")
        logger.error(f"Module: {module}")
        logger.error(f"Table: codex-{world}-{module}")
        logger.error(f"pk: {pk}")
        responseBody = {
            "error": "Generic reader error"
        }
        return responseFormatter(500, responseBody)

@tracer.capture_method
def writeToDynamo(payload: dict, pk: str, module: str, world: str):
    dynamo = boto3.resource("dynamodb")
    table = dynamo.Table(f"codex-{world}-{module}")
    try:
        assert all(k in payload.keys() for k in putRequestKeys[module])
        idProblems = findDuplicateIds(payload, module)
        if idProblems:
            logger.error(f"Write rejected: duplicate or missing entity ids in {module}: {idProblems}")
            return responseFormatter(422, {
                "error": "duplicate or missing entity ids",
                "problems": idProblems,
            })
        toPut = {k: v for k, v in payload.items() if k != "expectedVersion"}
        toPut["updatedAt"] = datetime.datetime.now().isoformat()
        toPut["pk"] = pk
        expectedVersion = payload.get("expectedVersion")
        if not expectedVersion:
            newVersion = 1
        else:
            newVersion = expectedVersion + 1
        toPut["version"] = newVersion
    except AssertionError as e:
        logger.error(f"Write error 1: {e}")
        logger.error(f"payload.keys: {payload.keys()}")
        logger.error(f"Module: {module}")
        logger.error(f"Table: codex-{world}-{module}")
        logger.error(f"pk: {pk}")
        responseBody = {
            "error": str(e)
        }
        return responseFormatter(400, responseBody)
    try:
        if expectedVersion is None:
            table.put_item(
                Item=toPut,
                ConditionExpression="attribute_not_exists(pk)",
            )
        else:
            table.put_item(
                Item=toPut,
                ConditionExpression="attribute_not_exists(pk) OR version = :expectedVersion",
                ExpressionAttributeValues={":expectedVersion": expectedVersion}
            )
        responseBody = {
            "version": int(toPut["version"]),
            "updatedAt": toPut["updatedAt"]
        }
        return responseFormatter(200, responseBody)
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            expectedVersion = payload.get("expectedVersion")
            logger.error(f"Write error 2 (Dynamo Condition Check): {e}")
            logger.error(f"Module: {module}")
            logger.error(f"Table: codex-{world}-{module}")
            logger.error(f"pk: {pk}")
            logger.error(f"expectedVersion: {expectedVersion}" )
            responseBody = {
                "error": str(e)
            }
            return responseFormatter(409, responseBody)
        else:
            logger.error(f"Write error 3 (Dynamo Error): {e}")
            logger.error(f"Module: {module}")
            logger.error(f"Table: codex-{world}-{module}")
            logger.error(f"pk: {pk}")
            responseBody = {
                "error": str(e)
            }
            return responseFormatter(500, responseBody)
    except:
        logger.error(f"Write error 3: Generic writer error")
        responseBody = {
            "error": "Generic writer error"
        }
        return responseFormatter(500, responseBody)


@app.get("/overview")
@tracer.capture_method
def getOverview():
    return readFromDynamo(pk="default", module="overview", world=getenv("WORLD"))


@app.put("/overview")
@tracer.capture_method
def putOverview():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="overview", world=getenv("WORLD"))

@app.get("/lore")
@tracer.capture_method
def getOverview():
    return readFromDynamo(pk="default", module="lore", world=getenv("WORLD"))

@app.put("/lore")
@tracer.capture_method
def putOverview():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="lore", world=getenv("WORLD"))

@app.get("/timeline")
@tracer.capture_method
def getTimeline():
    return readFromDynamo(pk="default", module="timeline", world=getenv("WORLD"))

@app.put("/timeline")
@tracer.capture_method
def putTimeline():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="timeline", world=getenv("WORLD"))

@app.get("/species")
@tracer.capture_method
def getSpecies():
    return readFromDynamo(pk="default", module="species", world=getenv("WORLD"))

@app.put("/species")
@tracer.capture_method
def putSpecies():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="species", world=getenv("WORLD"))

@app.get("/factions")
@tracer.capture_method
def getFactions():
    return readFromDynamo(pk="default", module="factions", world=getenv("WORLD"))

@app.put("/factions")
@tracer.capture_method
def putFactions():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="factions", world=getenv("WORLD"))

@app.get("/technology")
@tracer.capture_method
def getTechnology():
    return readFromDynamo(pk="default", module="technology", world=getenv("WORLD"))

@app.put("/technology")
@tracer.capture_method
def putTechnology():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="technology", world=getenv("WORLD"))

@app.get("/locations")
@tracer.capture_method
def getLocations():
    return readFromDynamo(pk="default", module="locations", world=getenv("WORLD"))

@app.put("/locations")
@tracer.capture_method
def putLocations():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="locations", world=getenv("WORLD"))

@app.get("/characters")
@tracer.capture_method
def getCharacters():
    return readFromDynamo(pk="default", module="characters", world=getenv("WORLD"))

@app.put("/characters")
@tracer.capture_method
def putCharacters():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="characters", world=getenv("WORLD"))

@app.get("/stories")
@tracer.capture_method
def getStories():
    return readFromDynamo(pk="default", module="stories", world=getenv("WORLD"))

@app.put("/stories")
@tracer.capture_method
def putStories():
    return writeToDynamo(payload=app.current_event.json_body, pk="default", module="stories", world=getenv("WORLD"))

@app.post("/images/upload")
@tracer.capture_method
def postImageUpload():
    body = app.current_event.json_body
    entity_type = body.get("entityType", "")
    entity_id = body.get("entityId", "")
    content_type = body.get("contentType", "")
    file_ext = body.get("fileExt", "").lstrip(".")
    if not content_type.startswith("image/"):
        return responseFormatter(400, {"error": "contentType must be image/*"})
    if not entity_type or not entity_id or not file_ext:
        return responseFormatter(400, {"error": "entityType, entityId, fileExt required"})
    key = f"images/{entity_type}/{entity_id}.{file_ext}"
    s3 = boto3.client("s3")
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": getenv("CODEXIMAGEBUCKET_BUCKET_NAME"), "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    image_url = f"https://{getenv('CLOUDFRONT_DOMAIN')}/{key}"
    return responseFormatter(200, {"uploadUrl": upload_url, "imageUrl": image_url})


@tracer.capture_method
def writeToS3(key, data):
    s3 = boto3.client("s3")
    bucket = getenv("CODEXBACKUPBUCKET_BUCKET_NAME")
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(data, default=json_serializer))
    except ClientError as e:
        logger.error(f"S3 Client Error: {e}")
        return False
    except:
        logger.error(f"S3 Generic Error")
        return False
    return True

@tracer.capture_method
def codexHandler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)

@tracer.capture_method
def codexBackupHandler(event: dict, context: LambdaContext) -> dict:
    dynamo = boto3.resource("dynamodb")
    fileDate = datetime.datetime.now().strftime("%Y%m%d")
    for module in ["timeline", "species", "factions", "technology", "locations", "overview", "lore", "characters", "stories"]:
        fileName = f"codex-{getenv('WORLD')}-{module}-{fileDate}.json"
        try:
            table = dynamo.Table(f"codex-{getenv('WORLD')}-{module}")
            response = table.get_item(
                Key={
                    'pk': "default"
                }
            )
            data = response.get("Item")
        except ClientError as e:
            logger.error(f"DynamoDB client error: {e}")
        except:
            logger.error(f"DynamoDB generic error")
        try:
            assert writeToS3(fileName, data)
        except AssertionError:
            logger.error(f"S3 Error")
            raise
    return {"status": 200}
            