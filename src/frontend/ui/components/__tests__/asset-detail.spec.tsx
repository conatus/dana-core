/**
 * @jest-environment jsdom
 */

import {
  render,
  RenderResult,
  waitForElementToBeRemoved
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropsWithChildren } from 'react';
import {
  Asset,
  SchemaProperty,
  SchemaPropertyType,
  UpdateAssetMetadata
} from '../../../../common/asset.interfaces';
import { error, ok } from '../../../../common/util/error';
import { Dict } from '../../../../common/util/types';
import { IpcContext } from '../../../ipc/ipc.hooks';
import { MockIpc } from '../../../ipc/mock-ipc';
import { AssetDetail } from '../asset-detail.component';

const SCHEMA: SchemaProperty[] = [
  {
    id: 'someProperty',
    label: 'Some Property',
    required: true,
    type: SchemaPropertyType.FREE_TEXT
  },
  {
    id: 'someOtherProperty',
    label: 'Some Other Property',
    required: false,
    type: SchemaPropertyType.FREE_TEXT
  }
];

describe(AssetDetail, () => {
  test('Editing an asset and saving changes submits a change request, then resets the editing state', async () => {
    const fixture = setup();
    const asset = someAsset();
    const onUpdate = fixture.givenThatTheUpdateSucceeds();

    const tree = render(
      <fixture.context>
        <AssetDetail asset={asset} schema={SCHEMA} />
      </fixture.context>
    );

    await beginEditing(tree);
    await editMetadataFields(tree, {
      'Some Property': 'New Value'
    });
    await requestSave(tree);
    await waitForEditModeToEnd(tree);
    await shouldDisplayReadonlyProperyValue(tree, SCHEMA[0], asset.metadata);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ someProperty: 'New Value' })
      })
    );
  });

  test('Editing an asset and canceling changes does not submit a change request and resets the editing state', async () => {
    const fixture = setup();
    const asset = someAsset();

    const onUpdate = fixture.givenThatTheUpdateSucceeds();

    const tree = render(
      <fixture.context>
        <AssetDetail asset={asset} schema={SCHEMA} />
      </fixture.context>
    );

    await beginEditing(tree);
    await editMetadataFields(tree, {
      'Some Property': 'New Value'
    });
    await requestCancel(tree);
    await waitForEditModeToEnd(tree);
    await shouldDisplayReadonlyProperyValue(tree, SCHEMA[0], asset.metadata);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  test('Validation errors are displayed to the user', async () => {
    const fixture = setup();
    const asset = someAsset();

    fixture.givenThatTheUpdateFails({
      someProperty: ['Oops']
    });

    const tree = render(
      <fixture.context>
        <AssetDetail asset={asset} schema={SCHEMA} />
      </fixture.context>
    );

    await beginEditing(tree);
    await editMetadataFields(tree, {
      'Some Property': 'New Value'
    });
    await requestSave(tree);

    expect(await tree.findAllByText(/Oops/)).toHaveLength(1);
  });
});

function setup() {
  const ipc = new MockIpc();

  return {
    ipc,
    context: ({ children }: PropsWithChildren<object>) => {
      return (
        <IpcContext.Provider value={{ ipc }}>{children}</IpcContext.Provider>
      );
    },
    givenThatTheUpdateSucceeds() {
      const onUpdate = jest.fn();
      ipc.handle({
        type: UpdateAssetMetadata,
        result: async (req) => {
          onUpdate(req);
          return ok();
        }
      });
      return onUpdate;
    },
    givenThatTheUpdateFails(errors: Dict<string[]>) {
      const onUpdate = jest.fn();
      ipc.handle({
        type: UpdateAssetMetadata,
        result: async (req) => {
          onUpdate(req);
          return error(errors);
        }
      });
      return onUpdate;
    }
  };
}

async function beginEditing(tree: RenderResult) {
  const editButton = tree.getByText(/Edit/);
  userEvent.click(editButton);

  await waitForElementToBeRemoved(editButton);
}

async function editMetadataFields(tree: RenderResult, fields: Dict) {
  for (const [key, val] of Object.entries(fields)) {
    const field = tree.getByLabelText(key) as HTMLInputElement;
    field.value = '';
    await userEvent.type(field, String(val));
  }
}

async function requestSave(tree: RenderResult) {
  const button = tree.getByText(/Save/);
  userEvent.click(button);
}

async function requestCancel(tree: RenderResult) {
  const button = tree.getByText(/Cancel/);
  userEvent.click(button);
}

async function waitForEditModeToEnd(tree: RenderResult) {
  const saveButton = tree.getByText(/Save/);
  await waitForElementToBeRemoved(saveButton);
}

async function shouldDisplayReadonlyProperyValue(
  tree: RenderResult,
  property: SchemaProperty,
  metadata: Dict
) {
  const propertyValue = tree.getByText(property.label)
    .nextSibling as HTMLElement;

  expect(propertyValue.innerHTML).toEqual(metadata[property.id]);
}

const someAsset = (): Asset => ({
  id: 'myAsset',
  media: [],
  metadata: {
    someProperty: 'Hi'
  }
});