import { randomUUID } from 'crypto';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session
} from 'electron';
import EventEmitter from 'eventemitter3';
import { uniqueId } from 'lodash';
import { platform } from 'os';
import path from 'path';
import { URL } from 'url';

import {
  FrontendConfig,
  ModalIcon,
  ModalType
} from '../../common/frontend-config';
import {
  GetMaximizationState,
  MaximizationState,
  MaximizationStateChanged,
  ToggleMaximizeWindow,
  MinimizeWindow,
  ShowContextMenu,
  ShowContextMenuResult,
  ShowModal,
  ReturnModalValue,
  ShowFilePickerModal,
  CreateWindow,
  WindowSize
} from '../../common/ui.interfaces';
import { error, ok } from '../../common/util/error';
import { MediaFileService } from '../media/media-file.service';
import { getFrontendPlatform } from '../util/platform';
import {
  FRONTEND_BUNDLE_DIR,
  FRONTEND_ENTRYPOINT,
  HIDE_UNTIL_RENDER,
  SHOW_DEVTOOLS
} from './config';
import { RELEASE_DATE } from './release';
import { getResourcePath } from './resources';
import { ElectronRouter } from './router';

interface CreateFrontendWindow {
  /** Title of the window */
  title: string;

  /** Config object passed to frontend */
  config: Omit<
    FrontendConfig,
    'platform' | 'windowId' | 'version' | 'releaseDate'
  >;

  size?: WindowSize;

  /** Resolve `media:` url schemes to an absolute path */
  resolveMedia?: MediaResolveFn;

  router: ElectronRouter;
}

/** Resolve `media:` url schemes to an absolute path */
type MediaResolveFn = (uri: string) => string;

/** Show a new frontend window */
export async function createFrontendWindow({
  title,
  config,
  size = WindowSize.REGULAR,
  resolveMedia,
  router
}: CreateFrontendWindow) {
  const mergedConfig: FrontendConfig = {
    ...config,
    windowId: uniqueId(),
    platform: getFrontendPlatform(),
    title,
    version: app.getVersion(),
    releaseDate: RELEASE_DATE
  };

  const getSize = () => {
    if (size === 'regular') {
      return {
        height: 950,
        width: 1100,
        minWidth: 280,
        minHeight: 155
      };
    }

    if (size === 'small') {
      return {
        height: 300,
        width: 300,
        minWidth: 300,
        minHeight: 300,
        resizable: false,
        minimizable: false,
        maximizable: false
      };
    }

    if (size === 'narrow') {
      return {
        height: 600,
        width: 400,
        minWidth: 300,
        minHeight: 300,
        resizable: false,
        minimizable: false,
        maximizable: false
      };
    }

    if (size === 'dialog') {
      return {
        height: 400,
        width: 600,
        minWidth: 600,
        minHeight: 400,
        resizable: false,
        minimizable: false,
        maximizable: false
      };
    }
  };

  const partition = initUrlSchemePartition(resolveMedia);
  const frontendWindow = new BrowserWindow({
    title,

    // Prevent flash of empty content by waiting until we've rendered before showing
    ...(HIDE_UNTIL_RENDER
      ? {
          paintWhenInitiallyHidden: true,
          show: false
        }
      : {}),

    // Show a frameless window so that we can render our own chrome
    frame: false,
    transparent: platform() !== 'win32',
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    closable: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    thickFrame: false,

    webPreferences: {
      additionalArguments: [
        '--frontend-config=' + JSON.stringify(mergedConfig)
      ],
      webSecurity: true,
      partition,
      preload: getResourcePath('preload/browser-preload.js')
    },

    ...getSize()
  });

  const emitState = (state: MaximizationState) => {
    router.emit(MaximizationStateChanged, state, frontendWindow.webContents);
  };

  frontendWindow.on('minimize', () => emitState('minimized'));
  frontendWindow.on('maximize', () => emitState('maximized'));
  frontendWindow.on('unmaximize', () => emitState('normal'));

  await Promise.all([
    frontendWindow.loadURL(FRONTEND_ENTRYPOINT),
    showWindowAfterFirstRender(mergedConfig, frontendWindow)
  ]);

  app.dock?.show();

  frontendWindow.focus();

  return frontendWindow;
}

/**
 * Grants the window access to custom url schemes to access media and source files over custom url schemes.
 * See: https://www.electronjs.org/docs/latest/api/protocol#using-protocol-with-a-custom-partition-or-session
 *
 * This is needed because we can't safely allow the renderer process access to `file://` urls.
 *
 * @param mediaDir Directory to serve media from.
 * @returns An electron partition id defining the privilages we're granting to the new window.
 */
function initUrlSchemePartition(resolveMedia?: MediaResolveFn) {
  const partition = uniqueId('partition:');
  const ses = session.fromPartition(partition);

  // Delegate resolution of `media:` urls to the caller of `createFrontendWindow()`
  if (resolveMedia) {
    ses.protocol.registerFileProtocol('media', (request, cb) => {
      cb(resolveMedia(request.url));
    });
  }

  // If we're running against a built source bundle, resolve `app:` urls from the frontend bundle directory.
  const bundleDir = FRONTEND_BUNDLE_DIR;
  if (bundleDir) {
    ses.protocol.registerFileProtocol('app', (request, cb) => {
      const { pathname } = new URL(request.url);
      cb(path.join(bundleDir, pathname));
    });
  }

  return partition;
}

/** Don't show the window immediately – wait for react to render first */
function showWindowAfterFirstRender(
  config: FrontendConfig,
  window: BrowserWindow
) {
  return new Promise<void>((resolve) => {
    const onWindowRendered = (_evt: unknown, id: string) => {
      if (id !== config.windowId) {
        return;
      }

      ipcMain.off('render-window', onWindowRendered);
      if (window.isDestroyed()) {
        return;
      }

      if (HIDE_UNTIL_RENDER) {
        window.show();
      }

      resolve();

      if (SHOW_DEVTOOLS) {
        window.maximize();

        // Showing devtools immediately after loading the window seems to break devtools and result in a blank pane.
        // Wait for a few seconds before opening in order to keep electron happy.
        setTimeout(() => {
          if (!window.isDestroyed()) {
            window.webContents.openDevTools();
          }
        }, 2000);
      }
    };

    ipcMain.on('render-window', onWindowRendered);
  });
}

const getMaximizationState = (window: BrowserWindow): MaximizationState => {
  if (window.isMinimized()) {
    return 'minimized';
  } else if (window.isMaximized()) {
    return 'maximized';
  } else {
    return 'normal';
  }
};

/**
 * Declare elevated privilages for our custom uri schemes safe and not subject to the CSP.
 * This must happen before the electron app is initialized, so we do it at module scope.
 *
 * See: https://www.electronjs.org/docs/latest/api/protocol#using-protocol-with-a-custom-partition-or-session
 */
protocol.registerSchemesAsPrivileged([
  // `media:` urls load media renditions from user data on the local filesystem.
  // This tells the browser to treat them like https: urls.
  { scheme: 'media', privileges: { secure: true } },

  // `app:` urls load static assets and source files from the app bundle.
  // This tells the browser to:
  // - Treat them like https: urls
  // - Treat them as origins (including a domain portion) so that they can reference each other via relative paths.
  {
    scheme: 'app',
    privileges: { secure: true, standard: true }
  }
]);

/**
 * Setup IPC handlers for managing windows
 *
 * @param router The IPC router to bind to
 */
export async function initWindows(router: ElectronRouter) {
  const visibleModals = new EventEmitter<{
    [windowId: string]: [{ action: 'confirm' | 'cancel' }];
  }>();

  router.bindRpc(
    ShowContextMenu,
    (req) =>
      new Promise<ShowContextMenuResult>((resolve) => {
        const menu = Menu.buildFromTemplate(
          req.menuItems.map((item) => {
            if (item.id === '-') {
              return {
                type: 'separator'
              };
            }

            return {
              label: item.label,
              click: () => {
                resolve(ok({ action: item.id }));
              }
            };
          })
        );

        menu.popup({ x: req.x, y: req.y });
        menu.on('menu-will-close', () => {
          setTimeout(() => {
            resolve(error('cancelled'));
          });
        });
      })
  );

  router.bindRpc(MinimizeWindow, async (_1, _2, _3, contents) => {
    BrowserWindow.fromWebContents(contents)?.minimize();
    return ok();
  });

  router.bindRpc(ToggleMaximizeWindow, async (_1, _2, _3, contents) => {
    const window = BrowserWindow.fromWebContents(contents);
    if (window?.isMaximized()) {
      router.emit(MaximizationStateChanged, 'normal');
      window.unmaximize();
    } else {
      router.emit(MaximizationStateChanged, 'maximized');
      window?.maximize();
    }

    return ok();
  });

  router.bindRpc(ShowModal, async (req, documentId) => {
    const returnId = randomUUID();
    await createFrontendWindow({
      title: req.title,
      router,
      size: WindowSize.DIALOG,
      config: {
        type: 'modal',
        documentId,
        title: req.title,
        modalConfig: {
          message: { __html: req.message },
          type: req.type as ModalType,
          icon: req.icon as ModalIcon,
          confirmButtonLabel: req.confirmButtonLabel,
          cancelButtonLabel: req.cancelButtonLabel,
          returnId
        }
      }
    });

    return new Promise((resolve) => {
      visibleModals.once(returnId, ({ action }) => {
        resolve(ok({ action }));
      });
    });
  });

  router.bindRpc(ReturnModalValue, async (req) => {
    visibleModals.emit(req.returnId, { action: req.action });
    return ok();
  });

  router.bindRpc(GetMaximizationState, async (_1, _2, _3, contents) => {
    const window = BrowserWindow.fromWebContents(contents);
    return window
      ? ok<MaximizationState>(getMaximizationState(window))
      : error('UNKNOWN_WINDOW');
  });

  router.bindRpc(ShowFilePickerModal, async (req, _2, _3, contents) => {
    const window = BrowserWindow.fromWebContents(contents);
    if (!window) {
      return error('UNKNOWN_WINDOW');
    }

    const res = await dialog.showOpenDialog(window, {
      buttonLabel: req.confirmButtonLabel,
      filters: req.filters,
      message: req.message,
      title: req.title
    });

    return ok(res.canceled ? undefined : res.filePaths);
  });

  router.bindArchiveRpc(
    CreateWindow,
    async (archive, { title, path, size = WindowSize.REGULAR }) => {
      const window = await createFrontendWindow({
        title,
        router,
        size,
        resolveMedia: (uri) =>
          MediaFileService.resolveRenditionUri(archive, uri),
        config: {
          type: 'archive',
          documentId: archive.id,
          initialPath: path
        }
      });

      router.addWindow(window.webContents, archive.id);

      return ok();
    }
  );
}
