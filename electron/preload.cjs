const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('driveman', {
  fs: {
    listDir: (dirPath) => ipcRenderer.invoke('fs:list-dir', dirPath),
    stat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
    move: (src, dst) => ipcRenderer.invoke('fs:move', src, dst),
    delete: (filePath) => ipcRenderer.invoke('fs:delete', filePath),
    createFolder: (dirPath) => ipcRenderer.invoke('fs:create-folder', dirPath),
    openFile: (filePath) => ipcRenderer.invoke('fs:open-file', filePath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    watch: (dirPath) => ipcRenderer.invoke('fs:watch', dirPath),
    diskInfo: (dirPath) => ipcRenderer.invoke('fs:disk-info', dirPath),
    onChanged: (cb) => ipcRenderer.on('fs:changed', (_e, data) => cb(data))
  },
  app: {
    getDriveRoot: () => ipcRenderer.invoke('app:get-drive-root'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openSettings: () => ipcRenderer.invoke('app:open-settings')
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  logs: {
    getRecent: () => ipcRenderer.invoke('logs:get-recent'),
    getDir: () => ipcRenderer.invoke('logs:get-dir')
  }
});