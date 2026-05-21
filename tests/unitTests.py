from src.app import readFromDynamo, writeToDynamo, findDuplicateIds
from unittest.mock import MagicMock, patch
from unittest import TestCase
from moto import mock_aws
import json
import boto3


def _entity_table(world, module):
    """Helper: create an empty codex-{world}-{module} table for entity tests."""
    dynamodb = boto3.resource("dynamodb", "us-east-1")
    return dynamodb.create_table(
        BillingMode="PAY_PER_REQUEST",
        TableName=f"codex-{world}-{module}",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
    )

class MockDynamoDb():
    def __init__(self):
        table_name = 'codex-local-timeline'
        dynamodb = boto3.resource('dynamodb', 'us-east-1')
        table = dynamodb.create_table(
            BillingMode="PAY_PER_REQUEST",
            TableName = table_name,
            KeySchema = [
                {
                    'AttributeName': 'pk',
                    'KeyType': 'HASH'
                },
            ],
            AttributeDefinitions = [
                {
                    'AttributeName': 'pk',
                    'AttributeType': 'S'
                },
            ]
        )
        item = {
            'pk': 'default',
            'events': [1, 2, 3],
            'eras': [1, 2, 3],
            'version': 1,
            'updatedAt': 'today'
        }
        table.put_item(Item=item)

class TestCodexTimeline(TestCase):
    @mock_aws
    def testReadFromDynamo(self):
        db = MockDynamoDb()
        result = readFromDynamo(pk="default", module="timeline", world="local")
        body = json.loads(result.body)
        assert all(k in body.keys() for k in ["events", "eras", "updatedAt", "version"])
        assert result.status_code == 200
        
    @mock_aws
    def testWriteToDynamo(self):
        db = MockDynamoDb()
        item = {
            'events': [7, 8, 9],
            'eras': [7, 8, 9],
            'expectedVersion': 1,
        }
        result = writeToDynamo(payload=item, pk="default", module="timeline", world="local")
        body = json.loads(result.body)
        print("keys")
        print(body.keys())
        print(result.status_code)
        print(body)
        assert all(k in body.keys() for k in ["version", "updatedAt"])
        assert result.status_code == 200
        assert body.get("version") == 2
    
    @mock_aws
    def testReadFromDynamoWrongPk(self):
        db = MockDynamoDb()
        result = readFromDynamo(pk="nope", module="timeline", world="local")
        assert result.status_code == 404
    
    @mock_aws
    def testWriteToDynamoMissingKeys(self):
        db = MockDynamoDb()
        item = {
            'events': [7, 8, 9],
            'expectedVersion': 1,
        }
        result = writeToDynamo(payload=item, pk="nope", module="timeline", world="local")
        assert result.status_code == 400
    
    @mock_aws
    def testWriteToDynamoDbWrongExpectedVersion(self):
        db = MockDynamoDb()
        item = {
            'events': [0, 3, 6],
            'eras': [0, 3, 6],
            'expectedVersion': 2
        }
        result = writeToDynamo(payload=item, pk="default", module="timeline", world="local")
        assert result.status_code == 409


class TestDuplicateIdValidation(TestCase):
    """Phase 1c: server-side rejection of payloads with duplicate or missing entity IDs."""

    def testFindDuplicateIdsCleanArray(self):
        payload = {"locations": [{"id": "a", "name": "X"}, {"id": "b", "name": "Y"}]}
        assert findDuplicateIds(payload, "locations") == []

    def testFindDuplicateIdsCatchesCollision(self):
        payload = {"locations": [
            {"id": "a", "name": "X"},
            {"id": "a", "name": "Y"},
            {"id": "b", "name": "Z"},
        ]}
        problems = findDuplicateIds(payload, "locations")
        assert len(problems) == 1
        assert problems[0]["key"] == "locations"
        assert problems[0]["duplicates"] == {"a": [0, 1]}

    def testFindDuplicateIdsCatchesMissingId(self):
        payload = {"species": [{"id": "a"}, {"name": "no id here"}]}
        problems = findDuplicateIds(payload, "species")
        assert len(problems) == 1
        assert problems[0]["missingIds"] == [1]

    def testFindDuplicateIdsChecksBothTimelineArrays(self):
        # timeline has two entity arrays: events and eras
        payload = {
            "events": [{"id": "e1"}, {"id": "e1"}],
            "eras": [{"id": "era1"}, {"id": "era2"}],
        }
        problems = findDuplicateIds(payload, "timeline")
        # Only events should be flagged
        assert len(problems) == 1
        assert problems[0]["key"] == "events"

    def testFindDuplicateIdsSkipsNonEntityArrays(self):
        # overview is not an entity array - should never be checked
        payload = {"overview": {"title": "X"}}
        assert findDuplicateIds(payload, "overview") == []

    @mock_aws
    def testWriteRejectsDuplicateIds(self):
        _entity_table("local", "locations")
        item = {
            "locations": [
                {"id": "abc", "name": "Sol"},
                {"id": "abc", "name": "Alpha Centauri"},  # collision
            ],
            "expectedVersion": None,
        }
        result = writeToDynamo(payload=item, pk="default", module="locations", world="local")
        body = json.loads(result.body)
        assert result.status_code == 422
        assert "duplicate" in body["error"].lower()
        assert body["problems"][0]["duplicates"] == {"abc": [0, 1]}

    @mock_aws
    def testWriteAcceptsUniqueIds(self):
        _entity_table("local", "locations")
        item = {
            "locations": [
                {"id": "abc", "name": "Sol"},
                {"id": "def", "name": "Alpha Centauri"},
            ],
            "expectedVersion": None,
        }
        result = writeToDynamo(payload=item, pk="default", module="locations", world="local")
        assert result.status_code == 200


if __name__ == "__main__":
    unittest.main()