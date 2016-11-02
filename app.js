// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const os = require('os');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

const electron = require('electron');
const async = require('async');
const request = require('request');
const sudo = require('sudo-prompt');
const whereis = require('whereis');
const thinlinc = require('thinlinc');
const forge = require('node-forge');

const scapath = "https://sca.iu.edu/api"; //make it configurable?

//TODO maybe I should host this on IU server?
const client_cache = "https://dl.dropboxusercontent.com/u/3209692/thinlinc/";

//debug
console.log("running on "+os.platform());
console.log(JSON.stringify(process.versions, null, 4));

window.open_devtool = function() {
    electron.ipcRenderer.send('show-console');
}

var app = angular.module('kdinstaller', []);

function get_homedir() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

app.factory('sca', function($http) {
    return {
        generate_sshkey: function(passphrase, comment, cb) {
            //return $http.get(scapath+"/wf/resource/gensshkey", {params: { password: password }}); //deprecated
            console.log("generating key pair")
            forge.pki.rsa.generateKeyPair({bits: 2048, workers: 2}, function(err, keypair) {
                if(err) return cb(err);
                cb(null, 
                    forge.ssh.publicKeyToOpenSSH(keypair.publicKey, comment),
                    forge.ssh.privateKeyToOpenSSH(keypair.privateKey, passphrase)
                );
            });
        } ,
        install_sshkey: function(username, password, pubkey) {
            return $http.post(scapath+"/wf/resource/installsshkey", {
                username: username,
                password: password,
                pubkey: pubkey,
                comment: "SCA generated ssh key for Karst Desktop at "+(new Date()).toString(),
                host: "karst.uits.iu.edu"
            });
        } 
    }
});

app.component('progressStatus', {
    bindings: {
        detail: "<",
    },
    transclude: true,
    template: `
    <div ng-class="{
        'text-primary': $ctrl.detail.status == 'running',
        'text-success': $ctrl.detail.status == 'finished',
        'text-warning': $ctrl.detail.status == 'skipped',
        'text-danger': $ctrl.detail.status == 'failed',
        'text-muted': $ctrl.detail.status == 'waiting',
        }">
        <b ng-transclude></b>
        <div class="pull-right">
            <span ng-if="$ctrl.detail.status == 'waiting'" class="glyphicon glyphicon-hourglass" aria-hidden="true"></span>
            <span ng-if="$ctrl.detail.status == 'running'" class="glyphicon glyphicon-cog rotating" aria-hidden="true"></span>
            <span ng-if="$ctrl.detail.status == 'finished'" class="glyphicon glyphicon-ok" aria-hidden="true"></span>
            <span ng-if="$ctrl.detail.status == 'failed'" class="glyphicon glyphicon-remove" aria-hidden="true"></span>
            {{$ctrl.detail.status|uppercase}} 
        </div>
        <br>
        <small>{{$ctrl.detail.message}}</small>
        <hr>
    </div>
    `,
});

app.controller('kdinstallerController', function($scope, sca, $timeout) {

    $scope.gopage = (p) => {
        //console.log("gopage:"+p);
        $scope.page = p;

        //run things when page changes
        switch(p) {
        case "about": 
            progress_reset(); 
            break;
        case "sshkey":
            //$timeout(() => $("#username").focus());
            break;
        case "run": 
            run(); 
            break;
        }
        if(!$scope.$$phase) $scope.$apply(); //people say don't do this.. but..
    }

    $scope.error = (msg, detail) => {
        $scope.gopage("error");
        $scope.message = msg;
        $scope.message_detail = detail;
    }

    //platform specific config
    $scope.installer_name = null; 
    $scope.download_path = null;
    $scope.install_cmd = null;
    $scope.logo_path = null;
    $scope.tlclient_path = null;

    //form defaults
    $scope.form = {};

    //things we may generate
    $scope.private_key_path = path.join(get_homedir(), '.ssh', 'kd.id_rsa');
    $scope.public_key_path = path.join(get_homedir(), '.ssh', 'kd.id_rsa.pub');
    $scope.key = null;
    $scope.pubkey = null;

    /*
    if (os.arch() != "x64") {
        $scope.message = "Only x64 archtecture is supported";
        $scope.page = "error";
        return;
    }
    */

    //do various os specific initialization
    switch (os.platform()) {
    case "linux":
        //determine yum or dpkg to use..
        whereis('yum', function (err, path) {
            if (err) {
                whereis('dpkg', function (err, path) {
                    if (err) {
                        $scope.error("This tool only works on system that uses either yum or dpkg");
                    } else {
                        $scope.installer_name = "linux-amd64.deb";
                        $scope.download_path = os.tmpdir() + '/' + $scope.installer_name;
                        $scope.install_cmd = "dpkg -i " + $scope.download_path;
                    }
                });
            } else {
                $scope.installer_name = "linux-x86_64.rpm";
                $scope.download_path = os.tmpdir() + '/' + $scope.installer_name;
                $scope.install_cmd = "rpm --reinstall " + $scope.download_path;
            }
        });
        $scope.logo_path = "/opt/thinlinc/lib/tlclient/branding.png";
        $scope.tlclient_path = "/opt/thinlinc/bin/tlclient";
        break;
    case "win32":
        $scope.installer_name = "windows.zip";
        $scope.download_path = os.tmpdir() + '/' + $scope.installer_name;
        var programfiles_dir = child_process.execSync("echo %programfiles(x86)%", { encoding: 'utf8' }).trim();
        var install_dir = programfiles_dir + "\\ThinLinc Client";
        $scope.install_cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + $scope.download_path + "', '" + install_dir + "'); }\"";
        $scope.tlclient_path = install_dir + "\\tlclient.exe";
        $scope.logo_path = install_dir + "\\branding.png"; //TODO - not sure where this go yet..
        break;
    case "darwin":
        $scope.installer_name = "osx.tar.gz";
        $scope.download_path = os.tmpdir() + '/' + $scope.installer_name;
        $scope.install_cmd = "tar --no-same-owner -xzf " + $scope.download_path + " -C /Applications";
        $scope.logo_path = "/Applications/ThinLinc Client/Contents/lib/tlclient/branding.png";
        $scope.tlclient_path = "/Applications/ThinLinc Client.app/Contents/MacOS/tlclient";
        break;
    default:
        $scope.error('Unsupported Platform: '+os.platform());
        return;
    }

    function progress_reset() {
        //reset progress
        $scope.progress_detail = {
            sshkey: {status: "waiting", msg: null},
            download: {status: "waiting", msg: null},
            install: {status: "waiting", msg: null},
            configure: {status: "waiting", msg: null},
            desktop: {status: "waiting", msg: null},
        }     
    }

    $scope.progress = function(id, status, message) {
        console.log(message);
        $scope.progress_detail[id].status = status;
        $scope.progress_detail[id].message = message;
        if(!$scope.$$phase) $scope.$apply(); //people say don't do this.. but..
    }

    function mkdir_ssh(next) {
        $scope.progress("sshkey", "running", "Making sure ~/.ssh exists");
        fs.mkdir(get_homedir() + '/.ssh', function (err) {
            if (!err || (err && err.code === 'EEXIST')) {
                next();
            } else next(err);
        });
    } 

    function generate_sshkeys(next) {
        $scope.progress("sshkey", "running", "Generating SSH Keys");
        sca.generate_sshkey($scope.form.passphrase, $scope.form.username+"@iu.edu (kdinstaller)", function(err, pubkey, prikey) {
            if(err) {
                $scope.error("Failed to generate SSH Keys", res.data);
            } else {
                $scope.key = prikey; 
                $scope.pubkey = pubkey;
                next();                
            }
        });
    }

    function store_local_sshkeys(next) {
        $scope.progress("sshkey", "running", "Storing SSH keys locally");
        fs.writeFile($scope.private_key_path, $scope.key, function(err) {
            if (err) return next(err);
            //console.log("chmod-ing private key");
            fs.chmod($scope.private_key_path, '600', function(err) {
                if (err) return next(err);
                //console.log("storing pub key");
                fs.writeFile($scope.public_key_path, $scope.pubkey, next);
            });
        });
    }

    function store_remote_sshkeys(next) {
        $scope.progress("sshkey", "running", "Storing public keys on karst");
        sca.install_sshkey($scope.form.username, $scope.form.password, $scope.pubkey).then(
        function(res) {
            next();
        },
        function(res) {
            console.dir(res);
            $scope.error("Failed to install SSH Keys on karst.", res.data || res.statusText || "code: "+res.status);
        });
    }

    function download(next) {
        //console.log("starting download");
        $scope.progress("download", "running", "Downloading ThinLink Client");
        fs.stat($scope.download_path, function(err, stats) {
            if (!err && stats) {
                //console.log("skipping");
                $scope.progress("download", "skipped", "Already downloaded");
                next();
            } else {
                request(client_cache+'/'+$scope.installer_name)
                .on('error', function(err) {
                    $scope.error("Failed to download client", err);
                })
                .on('end', function() {
                    $scope.progress("download", "finished", "Downloaded");
                    next();
                })
                .pipe(fs.createWriteStream($scope.download_path));
            }
        });
    }

    function install(next) {
        $scope.progress("install", "running", "Installing ThinLink Client. Please allow administrative privilege.");

        //run the installer as root
        console.log("sudo-ing "+$scope.install_cmd);
        sudo.exec($scope.install_cmd, {
            name: "Thinlinc Install for Karst Desktop",
            //icns: '/Applications/Electron.app/Contents/Resources/Electron.icns', // (optional)
        }, function(err, stdout, stderr) {
            if(err) {
                console.dir(err);
                $scope.error("Failed to install thinlinc client", err);
            } else {
                $scope.progress("install", "finished", "Installed successfully");
                next();  
            }
        });
    };

    function install_launcher(next) {
        //TODO - once shell.writeShortcutLink becomes available, use it instead.
        switch (os.platform()) {
        case "linux":
            //TODO.. let's assume user is using gnome simply by looking for ~/Desktop
            fs.access(get_homedir()+"/Desktop", fs.F_OK, function(err){
                if(err) {
                    $scope.progress("desktop", "skipped");
                    return next();
                }
                var entry = "[Desktop Entry]\n";
                entry += "Name=IU Karst Desktop\n";
                entry += "Comment=ThinLink Client for IU Karst Desktop\n";
                entry += "Exec="+$scope.tlclient_path+"\n";
                //entry += "Icon="+$scope.logo_path+"\n";
                entry += "Icon=/opt/thinlinc/lib/tlclient/tlclient.svg\n";
                entry += "Terminal=false\n";
                entry += "Type=Application\n";
                entry += "Categories=Utility\n";
                console.dir(entry);
                var path = get_homedir()+"/Desktop/kd.desktop";
                fs.writeFile(path, entry, function(err) {
                    if(err) return next(err);
                    fs.chmod(path, '775', function(err) {
                        if (err) return next(err);
                        $scope.progress("desktop", "finished", "Installed desktop launcher");
                        next();
                    });
                });
            });
            break;
        case "win32":
            //create vbs script to create desktop..
            var vbs = "Set wsc = WScript.CreateObject(\"WScript.Shell\")\n";
            vbs += "Set lnk = wsc.CreateShortcut(wsc.SpecialFolders(\"desktop\") & \"\\Karst Desktop.LNK\")\n";
            vbs += "lnk.targetpath = \""+$scope.tlclient_path+"\"\n";
            vbs += "lnk.description = \"Karst Desktop Client\"\n";
            vbs += "lnk.save\n";
            var path = os.tmpdir()+"/kd.desktop.vbs";
            fs.writeFile(path, vbs, function(err) {
                if(err) return next(err); 
                //then run it..
                child_process.execSync(path);
                next();
            });
            break;
        default:
            $scope.progress("desktop", "skipped", "Skipping desktop shortcut installation");
            next();
        }
    }

    function run() {
        var tasks = [];  
        if($scope.form.install_sshkey) {
            console.debug("user requested to install ssh key");
            tasks.push(mkdir_ssh); 
            tasks.push(generate_sshkeys);
            tasks.push(store_remote_sshkeys);
            tasks.push(store_local_sshkeys);
            tasks.push(function (next) { 
                $scope.progress("sshkey", "finished", "Installed successfully");
                next();
            });
        } else {
            tasks.push(function (next) { 
                $scope.progress("sshkey", "skipped", "Skipped by user");
                next();
            });
        }

        tasks.push(download);
        tasks.push(install);
        tasks.push(function (next) { 
            $scope.progress("configure", "running", "Configuring ThinLinc");
            next();
        });

        if($scope.form.install_sshkey) {
            tasks.push(function (next) { thinlinc.setConfig("AUTHENTICATION_METHOD", "publickey", next); });
            tasks.push(function (next) { thinlinc.setConfig("LOGIN_NAME", $scope.form.username, next); });
            tasks.push(function (next) { thinlinc.setConfig("PRIVATE_KEY", $scope.private_key_path, next); });
        } else {
            tasks.push(function (next) { thinlinc.setConfig("AUTHENTICATION_METHOD", "password", next); });
        }
        tasks.push(function (next) { thinlinc.setConfig("SERVER_NAME", "desktop.karst.uits.iu.edu", next); });
        tasks.push(function (next) { thinlinc.setConfig("FULL_SCREEN_ALL_MONITORS", 0, next); });
        tasks.push(function (next) { thinlinc.setConfig("FULL_SCREEN_MODE", 0, next); });
        tasks.push(function (next) { thinlinc.setConfig("REMOTE_RESIZE", 1, next); });
        tasks.push(function (next) { 
            $scope.progress("configure", "finished", "Configured successfully");
            next();
        });
        tasks.push(install_launcher);

        //now run all tasks
        async.series(tasks, function (err) {
            if (err) {
                console.log("run failed");
                $scope.error(null, err);
            }
            $scope.$apply(function() {
                $scope.gopage("finish");
            });
        });
    }

    $scope.launch_tl = function() {
       console.log($scope.tlclient_path);
       child_process.spawn($scope.tlclient_path, { detached: true });
       electron.ipcRenderer.send('quit');
    }

    $scope.gopage("about");
});


