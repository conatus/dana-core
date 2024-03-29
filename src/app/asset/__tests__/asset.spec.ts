import { pick, zip } from 'lodash';
import {
  AccessControl,
  defaultSchemaProperty,
  SchemaProperty,
  SchemaPropertyType
} from '../../../common/asset.interfaces';
import { collectEvents } from '../../../test/event';
import { requireFailure, requireSuccess } from '../../../test/result';
import { getTempfiles, getTempPackage } from '../../../test/tempfile';
import { MediaFileService } from '../../media/media-file.service';
import { AssetsChangedEvent, AssetService } from '../asset.service';
import { CollectionService } from '../collection.service';
import {
  assetMetadata,
  assetMetadataItemMatcher,
  someSchemaProperty
} from '../test-utils';

const SCHEMA: SchemaProperty[] = [
  {
    ...defaultSchemaProperty(),
    id: 'optionalProperty',
    label: 'Optional Property',
    type: SchemaPropertyType.FREE_TEXT,
    repeated: false,
    required: false
  },
  {
    ...defaultSchemaProperty(),
    id: 'requiredProperty',
    label: 'Some Property',
    type: SchemaPropertyType.FREE_TEXT,
    repeated: false,
    required: true
  },
  {
    ...defaultSchemaProperty(),
    id: 'repeatedProperty',
    label: 'Some Property',
    type: SchemaPropertyType.FREE_TEXT,
    repeated: true,
    required: false
  }
];

function expectEvents(
  actual: AssetsChangedEvent[],
  expected: Partial<AssetsChangedEvent>[]
) {
  expect(actual.length).toEqual(expected.length);

  for (const [exp, act] of zip(expected, actual)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(pick(act, Object.keys(exp!))).toEqual(exp);
  }
}

describe(AssetService, () => {
  test('Creating and updating asset metadata replaces its metadata only with properties defined in the schema and emits the correct events', async () => {
    const fixture = await setup();
    const createEvents = collectEvents<AssetsChangedEvent>(
      fixture.service,
      'change'
    );

    const asset = requireSuccess(
      await fixture.service.createAsset(
        fixture.archive,
        fixture.assetCollection.id,
        {
          accessControl: AccessControl.RESTRICTED,
          metadata: {
            requiredProperty: ['1'],
            optionalProperty: ['2'],
            repeatedProperty: ['3', '4'],
            unknownProperty: ['No']
          }
        }
      )
    );

    expectEvents(createEvents.events, [
      {
        created: [
          expect.objectContaining({
            id: asset.id,
            collectionId: fixture.assetCollection.id
          })
        ],
        updated: []
      }
    ]);

    expect(
      await fixture.service.listAssets(
        fixture.archive,
        fixture.assetCollection.id
      )
    ).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            metadata: assetMetadata({
              requiredProperty: ['1'],
              optionalProperty: ['2'],
              repeatedProperty: ['3', '4']
            })
          })
        ]
      })
    );

    const updateEvents = collectEvents<AssetsChangedEvent>(
      fixture.service,
      'change'
    );

    await fixture.service.updateAsset(fixture.archive, asset.id, {
      metadata: {
        requiredProperty: ['Replace']
      }
    });

    expectEvents(updateEvents.events, [
      {
        updated: [expect.objectContaining({ id: asset.id })]
      }
    ]);

    expect(
      await fixture.service.listAssets(
        fixture.archive,
        fixture.assetCollection.id
      )
    ).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            metadata: assetMetadata({
              requiredProperty: ['Replace'],
              optionalProperty: [],
              repeatedProperty: []
            })
          })
        ]
      })
    );
  });

  test('Create asset requests with invalid metadata are rejected', async () => {
    const fixture = await setup();

    const res = await fixture.service.createAsset(
      fixture.archive,
      fixture.assetCollection.id,
      {
        accessControl: AccessControl.RESTRICTED,
        metadata: {}
      }
    );

    expect(res).toMatchObject({
      status: 'error',
      error: expect.objectContaining({
        requiredProperty: expect.any(Array)
      })
    });
  });

  test('Invalid updates to asset metadata are rejected', async () => {
    const fixture = await setup();

    const asset = requireSuccess(
      await fixture.service.createAsset(
        fixture.archive,
        fixture.assetCollection.id,
        {
          accessControl: AccessControl.RESTRICTED,
          metadata: {
            requiredProperty: ['1']
          }
        }
      )
    );

    const res = await fixture.service.updateAsset(fixture.archive, asset.id, {
      metadata: {}
    });

    expect(res).toMatchObject({
      status: 'error',
      error: expect.objectContaining({
        requiredProperty: expect.any(Array)
      })
    });
  });

  describe('casting properties', () => {
    describe('string properties', () => {
      test('non-strings are converted to strings', async () => {
        const fixture = await setup();
        const [property] = await fixture.givenTheSchema([
          {
            ...defaultSchemaProperty(),
            type: SchemaPropertyType.FREE_TEXT,
            id: 'dbRecord',
            label: 'Label',
            required: false,
            repeated: false
          }
        ]);

        const res = requireSuccess(
          await fixture.service.castOrCreatePropertyValue(
            fixture.archive,
            property,
            123
          )
        );
        expect(res).toEqual('123');
      });

      test('blank values are treated as nulls', async () => {
        const fixture = await setup();
        const [property] = await fixture.givenTheSchema([
          {
            ...defaultSchemaProperty(),
            type: SchemaPropertyType.FREE_TEXT,
            id: 'dbRecord',
            label: 'Label',
            required: false,
            repeated: false
          }
        ]);

        const res = requireSuccess(
          await fixture.service.castOrCreatePropertyValue(
            fixture.archive,
            property,
            ' '
          )
        );
        expect(res).toBeUndefined();
      });
    });

    describe('database references', () => {
      test('existing controlled database entries are referenced by label', async () => {
        const fixture = await setup();
        const db = await fixture.givenALabelRecordDatabase();
        const [property] = await fixture.givenTheSchema([
          {
            ...defaultSchemaProperty(),
            type: SchemaPropertyType.CONTROLLED_DATABASE,
            databaseId: db.id,
            id: 'dbRecord',
            label: 'Label',
            required: true,
            repeated: false
          }
        ]);

        const referencedAsset = requireSuccess(
          await fixture.service.createAsset(fixture.archive, db.id, {
            accessControl: AccessControl.RESTRICTED,
            metadata: { title: ['Value'] }
          })
        );

        const res = requireSuccess(
          await fixture.service.castOrCreatePropertyValue(
            fixture.archive,
            property,
            'Value'
          )
        );
        const dbAssets = await fixture.service.listAssets(
          fixture.archive,
          db.id
        );
        expect(dbAssets.total).toBe(1);
        expect(res).toEqual(referencedAsset.id);
      });

      test('where the target database supports it, controlled database entries are created on demand', async () => {
        const fixture = await setup();
        const db = await fixture.givenALabelRecordDatabase();
        const [property] = await fixture.givenTheSchema([
          {
            ...defaultSchemaProperty(),
            type: SchemaPropertyType.CONTROLLED_DATABASE,
            databaseId: db.id,
            id: 'dbRecord',
            label: 'Label',
            required: true,
            repeated: false
          }
        ]);

        const res = requireSuccess(
          await fixture.service.castOrCreatePropertyValue(
            fixture.archive,
            property,
            'Value'
          )
        );
        const dbAssets = await fixture.service.listAssets(
          fixture.archive,
          db.id
        );
        expect(dbAssets.total).toBe(1);
        expect(res).toEqual(dbAssets.items[0].id);
      });

      test('blank values are treated as nulls', async () => {
        const fixture = await setup();
        const db = await fixture.givenALabelRecordDatabase();
        const [property] = await fixture.givenTheSchema([
          {
            ...defaultSchemaProperty(),
            type: SchemaPropertyType.CONTROLLED_DATABASE,
            databaseId: db.id,
            id: 'dbRecord',
            label: 'Label',
            required: true,
            repeated: false
          }
        ]);

        const res = requireSuccess(
          await fixture.service.castOrCreatePropertyValue(
            fixture.archive,
            property,
            ' '
          )
        );
        const dbAssets = await fixture.service.listAssets(
          fixture.archive,
          db.id
        );
        expect(dbAssets.total).toBe(0);
        expect(res).toBeUndefined();
      });
    });
  });

  describe('deleting assets', () => {
    it('should not allow deletion of assets that are referenced by a single required property', async () => {
      const fixture = await setup();

      const targetDb = await fixture.givenAControlledDatabaseWithSchema([]);

      const [dbProperty] = await fixture.givenTheSchema([
        someSchemaProperty({
          type: SchemaPropertyType.CONTROLLED_DATABASE,
          required: true,
          databaseId: targetDb.id
        })
      ]);

      const targetRecord = requireSuccess(
        await fixture.service.createAsset(fixture.archive, targetDb.id, {
          accessControl: AccessControl.RESTRICTED,
          metadata: {}
        })
      );
      const referencingRecord = requireSuccess(
        await fixture.service.createAsset(
          fixture.archive,
          fixture.assetCollection.id,
          {
            accessControl: AccessControl.RESTRICTED,
            metadata: { [dbProperty.id]: [targetRecord.id] }
          }
        )
      );

      expect(
        await fixture.service.deleteAssets(fixture.archive, [targetRecord.id])
      ).toEqual({
        status: 'error',
        error: expect.arrayContaining([
          expect.objectContaining({
            assetId: referencingRecord.id
          })
        ])
      });

      expect(
        await fixture.service.listAssets(fixture.archive, targetDb.id)
      ).toHaveProperty('total', 1);
    });

    it('should remove references from non-required properties from the related record', async () => {
      const fixture = await setup();

      const targetDb = await fixture.givenAControlledDatabaseWithSchema([]);

      const [dbProperty] = await fixture.givenTheSchema([
        someSchemaProperty({
          type: SchemaPropertyType.CONTROLLED_DATABASE,
          required: false,
          databaseId: targetDb.id
        })
      ]);

      const targetRecord = requireSuccess(
        await fixture.service.createAsset(fixture.archive, targetDb.id, {
          accessControl: AccessControl.RESTRICTED,
          metadata: {}
        })
      );

      const referencingRecord = requireSuccess(
        await fixture.service.createAsset(
          fixture.archive,
          fixture.assetCollection.id,
          {
            accessControl: AccessControl.RESTRICTED,
            metadata: { [dbProperty.id]: [targetRecord.id] }
          }
        )
      );

      requireSuccess(
        await fixture.service.deleteAssets(fixture.archive, [targetRecord.id])
      );

      expect(
        await fixture.service.listAssets(fixture.archive, targetDb.id)
      ).toHaveProperty('total', 0);

      expect(
        await fixture.service.get(fixture.archive, referencingRecord.id)
      ).toHaveProperty('metadata', {
        [dbProperty.id]: assetMetadataItemMatcher([])
      });
    });

    it('should remove references from required properties from the related record where there would still be a remaining property', async () => {
      const fixture = await setup();

      const targetDb = await fixture.givenAControlledDatabaseWithSchema([]);

      const [dbProperty] = await fixture.givenTheSchema([
        someSchemaProperty({
          type: SchemaPropertyType.CONTROLLED_DATABASE,
          required: true,
          repeated: true,
          databaseId: targetDb.id
        })
      ]);

      const targetRecord = requireSuccess(
        await fixture.service.createAsset(fixture.archive, targetDb.id, {
          accessControl: AccessControl.RESTRICTED,
          metadata: {}
        })
      );

      const anotherRecord = requireSuccess(
        await fixture.service.createAsset(fixture.archive, targetDb.id, {
          accessControl: AccessControl.RESTRICTED,
          metadata: {}
        })
      );

      const referencingRecord = requireSuccess(
        await fixture.service.createAsset(
          fixture.archive,
          fixture.assetCollection.id,
          {
            accessControl: AccessControl.RESTRICTED,
            metadata: { [dbProperty.id]: [targetRecord.id, anotherRecord.id] }
          }
        )
      );

      requireSuccess(
        await fixture.service.deleteAssets(fixture.archive, [targetRecord.id])
      );

      expect(
        await fixture.service.listAssets(fixture.archive, targetDb.id)
      ).toHaveProperty('total', 1);

      expect(
        await fixture.service.get(fixture.archive, referencingRecord.id)
      ).toHaveProperty('metadata', {
        [dbProperty.id]: assetMetadataItemMatcher([anotherRecord.id])
      });
    });

    it('where a delete removes all references from a required, recurring property, the delete is rejected', async () => {
      const fixture = await setup();

      const targetDb = await fixture.givenAControlledDatabaseWithSchema([]);

      const [dbProperty] = await fixture.givenTheSchema([
        someSchemaProperty({
          type: SchemaPropertyType.CONTROLLED_DATABASE,
          required: true,
          repeated: true,
          databaseId: targetDb.id
        })
      ]);

      const targetRecords = [
        requireSuccess(
          await fixture.service.createAsset(fixture.archive, targetDb.id, {
            accessControl: AccessControl.RESTRICTED,
            metadata: {}
          })
        ),
        requireSuccess(
          await fixture.service.createAsset(fixture.archive, targetDb.id, {
            accessControl: AccessControl.RESTRICTED,
            metadata: {}
          })
        )
      ];

      const targedRecordIds = targetRecords.map((record) => record.id);

      requireSuccess(
        await fixture.service.createAsset(
          fixture.archive,
          fixture.assetCollection.id,
          {
            accessControl: AccessControl.RESTRICTED,
            metadata: {
              [dbProperty.id]: targedRecordIds
            }
          }
        )
      );

      requireFailure(
        await fixture.service.deleteAssets(fixture.archive, targedRecordIds)
      );

      expect(
        await fixture.service.listAssets(fixture.archive, targetDb.id)
      ).toHaveProperty('total', 2);
    });
  });

  describe('moving assets', () => {
    test('assets can be moved between compatible collections', async () => {
      const fixture = await setup();
      const otherCollection = await fixture.collectionService.createCollection(
        fixture.archive,
        fixture.rootAssetCollection.id,
        { title: 'Other Collection', schema: [] }
      );
      const asset = requireSuccess(
        await fixture.service.createAsset(
          fixture.archive,
          fixture.assetCollection.id,
          {
            accessControl: AccessControl.RESTRICTED,
            metadata: { requiredProperty: ['Hello'] }
          }
        )
      );

      requireSuccess(
        await fixture.service.moveAssets(
          fixture.archive,
          [asset.id],
          otherCollection.id
        )
      );
      const oldCollectionAssets = await fixture.service.listAssets(
        fixture.archive,
        fixture.assetCollection.id
      );
      const newCollectionAssets = await fixture.service.listAssets(
        fixture.archive,
        otherCollection.id
      );

      expect(oldCollectionAssets.total).toBe(0);
      expect(newCollectionAssets.total).toBe(1);
    });
  });

  test('assets cannot be moved between incompatible collections', async () => {
    const fixture = await setup();

    const database = await fixture.givenAControlledDatabaseWithSchema([]);

    const asset = requireSuccess(
      await fixture.service.createAsset(
        fixture.archive,
        fixture.assetCollection.id,
        {
          accessControl: AccessControl.RESTRICTED,
          metadata: { requiredProperty: ['Hello'] }
        }
      )
    );

    requireFailure(
      await fixture.service.moveAssets(fixture.archive, [asset.id], database.id)
    );
    const oldCollectionAssets = await fixture.service.listAssets(
      fixture.archive,
      fixture.assetCollection.id
    );
    const newCollectionAssets = await fixture.service.listAssets(
      fixture.archive,
      database.id
    );

    expect(oldCollectionAssets.total).toBe(1);
    expect(newCollectionAssets.total).toBe(0);
  });
});

async function setup() {
  const tmp = await getTempfiles();
  const archive = await getTempPackage(tmp());

  const collectionService = new CollectionService();
  const mediaService = new MediaFileService();
  const service = new AssetService(collectionService, mediaService);
  const rootAssetCollection = await collectionService.getRootAssetCollection(
    archive
  );
  const rootDbCollection = await collectionService.getRootDatabaseCollection(
    archive
  );
  await collectionService.updateCollectionSchema(
    archive,
    rootAssetCollection.id,
    SCHEMA
  );

  const assetCollection = await collectionService.createCollection(
    archive,
    rootAssetCollection.id,
    { schema: [], title: 'My Collection' }
  );

  return {
    givenTheSchema: async (schema: SchemaProperty[]) => {
      await collectionService.updateCollectionSchema(
        archive,
        rootAssetCollection.id,
        schema
      );
      return schema;
    },
    givenAControlledDatabaseWithSchema: (schema: SchemaProperty[]) => {
      return collectionService.createCollection(archive, rootDbCollection.id, {
        title: 'Some Database',
        schema
      });
    },
    givenALabelRecordDatabase: () => {
      return collectionService.createCollection(archive, rootDbCollection.id, {
        title: 'Some Database',
        schema: [
          {
            ...defaultSchemaProperty(),
            id: 'title',
            type: SchemaPropertyType.FREE_TEXT,
            label: 'Title',
            required: true,
            repeated: false
          }
        ]
      });
    },
    archive,
    collectionService,
    rootAssetCollection,
    rootDbCollection,
    assetCollection,
    mediaService,
    service
  };
}
