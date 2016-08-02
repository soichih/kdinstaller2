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
const sudo = require('electron-sudo');
const whereis = require('whereis');
const thinlinc = require('thinlinc');

//TODO point it to production instance eventually
const scapath = "https://test.sca.iu.edu/api";

//TODO maybe I should host this on IU server?
const client_cache = "https://dl.dropboxusercontent.com/u/3209692/thinlinc/";

window.open_devtool = function() {
    console.log("opening console");
    electron.ipcRenderer.send('show-console');
}

var app = angular.module('kdinstaller', []);

function get_homedir() {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

app.factory('sca', function($http) {
    return {
        generate_sshkey: function() {
            return $http.get(scapath+"/wf/resource/gensshkey");
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

app.controller('kdinstallerController', function($scope, sca) {

    $scope.gopage = (p) => {
        console.log("gopage:"+p);
        $scope.page = p;

        //run things when page changes
        switch(p) {
        case "about": progress_reset(); break;
        case "run": run(); break;
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

    //things we will generate
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
        $scope.install_cmd = "tar -xzf " + $scope.download_path + " -C /Applications";
        $scope.logo_path = "/Applications/ThinLinc Client/Contents/lib/tlclient/branding.png";
        $scope.tlclient_path = "/Applications/ThinLinc Client/Contents/MacOS/tlclient";
        break;
    default:
        $scope.error('Unsupported Platform: '+os.platform());
        return;
    }

    $scope.submit = (username, password) => {
        $scope.username = username;
        $scope.password = password;
        $scope.gopage("run");
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

    function request_sshkeys(next) {
        $scope.progress("sshkey", "running", "Generating SSH Keys");
        sca.generate_sshkey().then(function(res) {
            $scope.key = res.data.key; 
            $scope.pubkey = res.data.pubkey; 
            next();
        }, function(res) {
            $scope.error("Failed to generate SSH Keys", res.data);
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
        sca.install_sshkey($scope.username, $scope.password, $scope.pubkey).then(
        function(res) {
            next();
        },
        function(res) {
            $scope.error("Failed to install SSH Keys on karst.", res.data);
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
                    next();
                })
                .pipe(fs.createWriteStream($scope.download_path));
            }
        });
    }

    function install(next) {
        $scope.progress("install", "running", "Installing ThinLink Client. Please allow administrative privilege.");
        var options = {
            name: 'Installing ThinLinc Client',
            process: {
                options: {},
                on: function (ps) {
                    ps.stdout.on('data', function (data) {
                        console.log(data.toString());
                    });
                    ps.stderr.on('data', function (data) {
                        console.error(data.toString());
                    });
                }
            }
        };

        //run the installer as root
        console.log("sudo-ing "+$scope.install_cmd);
        sudo.exec($scope.install_cmd, options, function(err, data) {
            console.log(data); //message from installer... should I display?
            if (err) {
                console.dir(err);
                $scope.error("Failed to install thinlinc client", err);
                return;
            } else {
                $scope.progress("install", "finished", "Installed successfully");
                next();
            }
        });
    };

    function run() {
        //$scope.progress("sshkey", "running", "Generating / installing sshkey");
        async.series([
            mkdir_ssh,
            request_sshkeys,
            store_local_sshkeys,
            //function (next) { return store_remote_sshkeys(next); }, //today is maintenance day!
            function (next) { 
                $scope.progress("sshkey", "finished", "Installed successfully");
                next();
            },

            download,
            install,

            //configure
            function (next) { 
                $scope.progress("configure", "running", "Configuring ThinLinc");
                next();
            },
            function (next) { thinlinc.setConfig("AUTHENTICATION_METHOD", "publickey", next); },
            function (next) { thinlinc.setConfig("LOGIN_NAME", $scope.username, next); },
            function (next) { thinlinc.setConfig("PRIVATE_KEY", $scope.private_key_path, next); },
            function (next) { thinlinc.setConfig("SERVER_NAME", "desktop.karst.uits.iu.edu", next); },
            function (next) { thinlinc.setConfig("FULL_SCREEN_ALL_MONITORS", 0, next); },
            function (next) { thinlinc.setConfig("FULL_SCREEN_MODE", 0, next); },
            function (next) { thinlinc.setConfig("REMOTE_RESIZE", 1, next); },
            function (next) { 
                $scope.progress("configure", "finished", "Configured successfully");
                next();
            },

            //install desktop launcher
            function (next) { 
                //TODO - once shell.writeShortcutLink becomes available, use it instead.
                switch (os.platform()) {
                case "linux":
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
                default:
                    $scope.progress("desktop", "skipped", "Skipping desktop shortcut installation");
                    next();
                }
            },

        ], function (err) {
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
       child_process.spawn($scope.tlclient_path, { detached: true });
       electron.ipcRenderer.send('quit');
    }

    $scope.gopage("about");
});


