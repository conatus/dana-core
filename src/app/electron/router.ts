import { IpcMain, WebContents } from 'electron';
import {
  ResponseType,
  RpcInterface,
  EventInterface,
  RequestType
} from '../../common/ipc.interfaces';
import { required } from '../../common/util/assert';
import { Result } from '../../common/util/error';
import { ArchivePackage } from '../package/archive-package';
import { ArchiveService } from '../package/archive.service';

/**
 * Utility class for managing the electron side of frontend <-> electron app bindings.
 */
export class ElectronRouter {
  private _windows: Array<{ archiveId?: string; window: WebContents }> = [];
  constructor(private ipc: IpcMain, private archiveService: ArchiveService) {}

  /**
   * Route calls to an RPC method to a handler function.
   *
   * @param descriptor RPC method to route.
   * @param handler Function to handle calls to this method in the electorn app.
   */
  bindRpc<Rpc extends RpcInterface>(
    descriptor: Rpc,
    handler: (
      request: RequestType<Rpc>,
      paginationToken?: string,
      archiveId?: string
    ) => Promise<Result<ResponseType<Rpc>>>
  ) {
    this.ipc.handle(
      descriptor.id,
      async (
        _,
        request: Request,
        paginationToken?: string,
        archiveId?: string
      ): Promise<Result> => {
        // The schema validators aren't strictly needed in the electron app, but we use them here anyway
        // to ensure consistent behaviour with any future Web UI.
        const validatedRequest = descriptor.request.parse(request);

        const response = await handler(
          validatedRequest,
          archiveId,
          paginationToken
        );

        if (response.status === 'error') {
          const errorSchema = required(
            descriptor.error,
            'Did not expect error - RPC method does not define an error schema'
          );

          return {
            status: 'error',
            error: errorSchema.parse(response.error)
          };
        }

        return {
          status: 'ok',
          value: descriptor.response.parse(response.value)
        };
      }
    );
  }

  /**
   * Route calls to an RPC method to a handler function. Convenience variant that provides the archive instance for
   * the window that initated the request.
   *
   * @param descriptor RPC method to route.
   * @param handler Function to handle calls to this method in the electorn app.
   */
  bindArchiveRpc<Rpc extends RpcInterface>(
    descriptor: Rpc,
    handler: (
      archive: ArchivePackage,
      request: RequestType<Rpc>,
      paginationToken?: string
    ) => Promise<Result<ResponseType<Rpc>>>
  ) {
    this.bindRpc(descriptor, (request, paginationToken, archiveIdParam) => {
      const archiveId = required(archiveIdParam, 'Expected archive id');
      const archive = required(
        this.archiveService.getArchive(archiveId),
        'Archive is not open',
        archiveId
      );

      return handler(archive, request, paginationToken);
    });
  }

  /**
   * Dispatch an event to one or more open windows.
   *
   * @param descriptor Event type to dispatch
   * @param event Event payload
   * @param targetArchiveId If provided, will only target the window for this archive.
   */
  emit<Event>(
    descriptor: EventInterface<Event>,
    event: Event,
    targetArchiveId?: string
  ) {
    // The schema validators aren't strictly needed in the electron app, but we use them here anyway
    // to ensure consistent behaviour with the Web UI.
    const eventPayload = descriptor.type.parse(event);

    // If the event is sent to a specific archive, only send it to that window, otherwise send to all.
    for (const { archiveId, window } of this._windows) {
      if (!targetArchiveId || archiveId === targetArchiveId) {
        window.send(descriptor.id, eventPayload);
      }
    }
  }

  /**
   * Register a window as a target for events.
   *
   * @param window WebContents of the window registered
   * @param archiveId id of the archive to associate with the window
   */
  addWindow(window: WebContents, archiveId?: string) {
    const existing = this._windows.find((record) => record.window === window);
    if (existing && !existing.archiveId) {
      existing.archiveId = archiveId;
      return;
    }

    this._windows.push({ window, archiveId });
  }

  /**
   * Remove a window as a target for events.
   *
   * @param window WebContents of the window to unregister
   */
  removeWindow(window: WebContents) {
    const index = this._windows.findIndex((x) => x.window === window);

    if (index >= 0) {
      this._windows.splice(index, 1);
    }
  }

  /**
   * Return the window registered for the archive.
   *
   * @param archiveId id of the archive to return a window fore.
   * @returns The window associated with `archiveId` or else undefined.
   */
  getArchiveWindow(archiveId: string) {
    const existing = this._windows.find(
      (record) => record.archiveId === archiveId
    );
    return existing?.window;
  }

  get hasArchiveWindows() {
    return this._windows.some((w) => !!w.archiveId);
  }
}