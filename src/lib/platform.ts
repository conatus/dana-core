import path from 'path';

export function getFileUrl(pathString: string) {
  if (path.sep === '\\') {
    return 'file:///' + path.resolve(pathString).replace('\\', '/');
  }

  return 'file://' + path.resolve(pathString);
}
