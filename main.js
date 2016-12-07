
const electron = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const shell = electron.shell;

if (handleSquirrelEvent()) {
    return;
}
function handleSquirrelEvent() {

    if (process.argv.length === 1) {
    return false;
    }
    const sqevent = process.argv[1];
    switch (sqevent) {
    case '--squirrel-install':
    case '--squirrel-updated':
    case '--squirrel-uninstall':
    case '--squirrel-obsolete':
        app.quit();
        return true;
    }
};

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 650, height: 600, resizable: true, maximizable: false})

    //get rid of default electron menubar
    mainWindow.setMenu(null);

    // and load the index.html of the app.
    mainWindow.loadURL(`file://${__dirname}/index.html`)

    // Open the DevTools by default..
    //mainWindow.webContents.openDevTools()

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
    })

    //this api is coming down the pipe, I believe
    //shell.writeShortcutLink("/opt/thinlinc/bin/tlclient");
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.and
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

electron.ipcMain.on('show-console', function(e) {
    mainWindow.webContents.openDevTools();
});
electron.ipcMain.on('quit', function() {
    //console.log("quit request");
    app.quit();
});

