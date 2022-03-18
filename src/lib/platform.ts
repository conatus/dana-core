import path from 'path';

export function getFileUrl(pathString: string, pathModule = path) {
  if (pathModule.sep === '\\') {
    return 'file:///' + pathModule.resolve(pathString).replace(/\\/g, '/');
  }

  return 'file://' + pathModule.resolve(pathString);
}
