#!/usr/bin/env node

const fs = require('fs');
//https://github.com/electron/windows-installer
const electronInstaller = require('electron-winstaller');

//before running this, you need to run "npm run pack" to generate packes/kdinstall2-win32-x64
//installer will be in /tmp (will take 10 - 15 mins)

//to run signtool.exe on wine, it requires mfc42
//winetricks mfc42

resultPromise = electronInstaller.createWindowsInstaller({
    appDirectory: 'packed/kdinstall2-win32-x64',
    outputDirectory: '/home/hayashis/Dropbox/Public/kdinstall',
    authors: 'IU / SciApt',
    exe: 'kdinstall2.exe',
    setupExe: 'kdinstall2.exe',
    
    //winstaller fails
    //certificateFile: '/home/hayashis/.ssh/sciapt.pfx',
    //certificatePassword: fs.readFileSync('/home/hayashis/.ssh/sciapt_codesigning.pass').toString().trim(),
});

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));
