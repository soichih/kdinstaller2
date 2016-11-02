#!/bin/bash

#publishes to https://www.dropbox.com/sh/q7qib7yczlv21hq/AADZwwBtE7NKpoju76FwhkxPa?dl=0

pubdir=/home/hayashis/Dropbox/Public

###################################################################################################
#
#  electron-packager
#
# TODO - electron-packager has "osx-sign" option that seems to allow signing of the electron package
# but it says it only works on Mac. I should try this somehow
electron-packager . --all --out=packed --overwrite --prune

###################################################################################################
#
#  install thinlinc cache
#

version=4.6.0

#mac....
(cd packed/tl-$version-clients/client-osx && mkdir -p iso && fuseiso *.iso iso && cd iso && tar -czf $pubdir/thinlinc/osx.tar.gz ./ && cd .. && fusermount -u iso && rmdir iso)

#download clients pacakge from cendio
if [ ! -d packed/tl-${version}-clients ]; then
    echo "need to download $version"
    (cd packed && wget https://www.cendio.com/downloads/clients/tl-$version-clients.zip && unzip -n tl-$version-clients.zip && rm tl-$version-clients.zip)
fi

#windows...
(cd packed/tl-$version-clients/client-windows/tl-$version-client-windows && zip -r $pubdir/thinlinc/windows.zip .)

#linux
cp packed/tl-$version-clients/client-linux-deb/*_amd64.deb $pubdir/thinlinc/linux-amd64.deb
cp packed/tl-$version-clients/client-linux-rpm/*.x86_64.rpm $pubdir/thinlinc/linux-x86_64.rpm

###################################################################################################
#
# publish kdinstall app.
#

#install the kdinstall (there are other packs, but for now I am going to distribute x64 only)
(cd packed && tar -cz kdinstall2-linux-x64 > $pubdir/kdinstall/kdinstall2-linux-x64.tar.gz)
(cd packed && tar -cz kdinstall2-darwin-x64 > $pubdir/kdinstall/kdinstall2-darwin-x64.tar.gz)
#winstaller.js takes care of publishing windows.exe

#echo "to create sfx archive for windows, run 7-zip on windows and create sfx there.."

echo "running winstaller.js - may take for a while"
time ./winstaller.js

