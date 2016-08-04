#!/usr/bin/env node
//https://github.com/electron/windows-installer
var electronInstaller = require('electron-winstaller');

//before running this, you need to run "npm run pack" to generate packes/kdinstall2-win32-x64
//installer will be in /tmp (will take 10 - 15 mins)

resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: 'packed/kdinstall2-win32-x64',
    outputDirectory: '/home/hayashis/Dropbox/Public/kdinstall',
    authors: 'IU / SciApt',
    exe: 'kdinstall2.exe',
    setupExe: 'kdinstall2.exe',
});

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));
