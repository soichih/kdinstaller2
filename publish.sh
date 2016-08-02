#!/bin/bash

pubdir=/home/hayashis/Dropbox/Public

###################################################################################################
#
#  install thinlinc cache
#

version=4.6.0

#download clients pacakge from cendio
if [ ! -d packed/tl-${version}-clients ]; then
    echo "need to download $version"
    (cd packed && wget https://www.cendio.com/downloads/clients/tl-$version-clients.zip && unzip -n tl-$version-clients.zip && rm tl-$version-clients.zip)
fi

#mac....
(cd packed/tl-$version-clients/client-osx && mkdir -p iso && fuseiso *.iso iso && cd iso && tar -czf $pubdir/thinlinc/osx.tar.gz ./ && cd .. && fusermount -u iso && rmdir iso)

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
