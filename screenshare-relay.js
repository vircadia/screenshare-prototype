//
//  screenshare-relay.js
//
//  Created by Kalila L. on 17 Oct 2020
//  Copyright 2020 Vircadia and contributors.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

// Use the websocket-relay to serve a raw MPEG-TS over WebSockets. You can use
// ffmpeg to feed the relay. ffmpeg -> websocket-relay -> browser
// Example:
// node websocket-relay yoursecret 8081 8082
// ffmpeg -i <some input> -f mpegts http://localhost:8081/yoursecret

// This is to help it work on Plesk.
if (typeof(PhusionPassenger) != 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
}

var fs = require('fs'),
http = require('http'),
WebSocket = require('ws');

function getArgs() {
    const args = process.argv.slice(2);
    let params = {};
    
    args.forEach(a => {
        const nameValue = a.split("=");
        params[nameValue[0]] = nameValue[1];
    });
    
    return params;
}

if (process.argv.length < 3) {
    console.log(
        'Usage: \n' +
        'node websocket-relay.js stream_port=<stream-port> stream_secret=<stream-secret> ws_port=<websocket-port> ws_secret=<websocket-secret> client_http_port=<client-http-web-port>'
    );
    //	process.exit();
}

const args = getArgs();
var STREAM_PORT = args.stream_port || 8020;
var STREAM_SECRET = args.stream_secret || "open";
var WEBSOCKET_PORT = args.ws_port || 8021;
var WEBSOCKET_SECRET = args.ws_secret || "open";
var CLIENT_HTTP_PORT = args.client_http_port || 8022;
var RECORD_STREAM = false;

// Websocket Server
var socketServer = new WebSocket.Server({path: "/" + WEBSOCKET_SECRET, port: WEBSOCKET_PORT, perMessageDeflate: false});

socketServer.connectionCount = 0;

socketServer.on('connection', function(socket, upgradeReq) {
    //RESTRICTED CONNECTION PARAMETERS
    //if(client.headers['user-agent'].includes("NT 10.0") == true)
    socketServer.connectionCount++;

    console.log(
        'New WebSocket Client Connection: ',
        (upgradeReq || socket.upgradeReq).socket.remoteAddress,
        (upgradeReq || socket.upgradeReq).headers['user-agent'],
        '('+socketServer.connectionCount+' total)'
    );
    socket.on('close', function(code, message){
        socketServer.connectionCount--;
        console.log(
            'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
        );
    });
});

socketServer.broadcast = function(data) {
    socketServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// HTTP Server to accept incoming MPEG-TS Stream from ffmpeg / OBS
var streamServer = http.createServer( function (request, response) {
    
    var params = request.url.substr(1).split('/');
    
    if (params[0] !== STREAM_SECRET) {
        console.log(
            'Failed Stream Connection: '+ request.socket.remoteAddress + ':' +
            request.socket.remotePort + ' - wrong secret.'
        );
        response.end();
    }
    
    response.connection.setTimeout(0);
    console.log(
        'Stream Connected: ' +
        request.socket.remoteAddress + ':' +
        request.socket.remotePort
        //request.socket.headers['user-agent']
    );

    request.on('data', function(data){
        socketServer.broadcast(data);
        if (request.socket.recording) {
            request.socket.recording.write(data);
        }
    });

    request.on('end',function(){
        console.log('close');
        if (request.socket.recording) {
            request.socket.recording.close();
        }
    });
    
    // Record the stream to a local file?
    if (RECORD_STREAM) {
        var path = 'recordings/' + Date.now() + '.ts';
        request.socket.recording = fs.createWriteStream(path);
    }
    
    //server.listen('passenger');
    
}).listen(STREAM_PORT);



console.log('Listening for incoming MPEG-TS Stream on http://127.0.0.1:' + STREAM_PORT + '/' + STREAM_SECRET);
console.log('Awaiting WebSocket connections on ws://127.0.0.1:' + WEBSOCKET_PORT + '/' + WEBSOCKET_SECRET);
console.log('View the stream through http://127.0.0.1:' + CLIENT_HTTP_PORT + '/index.html');
