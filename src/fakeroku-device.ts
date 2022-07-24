import * as  httpHeaders from 'http-headers';
import { Red, Node } from 'node-red';
import { Server, createServer, IncomingMessage, ServerResponse } from 'http';
import { Socket, createSocket } from 'dgram';

export interface Device {
    UUID: string,
    HTTP_PORT: number,
    SSDP_RESPONSE: Buffer,
    DESCXML: string,
    APPSXML: string
    DEVXML: string
}

export interface Config {
    port: number,
    ip: string,
    multicast: string,
    uuid: string
}

module.exports = function (RED: Red) {


    function FakeRokuNode(config: any) {
        let socket: Socket;
        let server: Server;
        let device: Device;
        let configNode: Config;
        let node = this;
        RED.nodes.createNode(node, config);
        configNode = RED.nodes.getNode(config.confignode) as unknown as Config;
        device = init(configNode);

        server = createServer((request: IncomingMessage, response: ServerResponse) => {
            //request.connection.ref();
            let method = request.method;
            let url = request.url;
            let body = [];

            request.on('error', (err) => {
                node.error(err);
            }).on('data', (chunk) => {
                body.push(chunk);
            }).on('end', () => {
                if (method === 'GET' && url == '/') {
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'text/xml; charset=utf-8');
                    response.setHeader('Connection', 'close');

                    response.end(device.DESCXML, () => {
                        request.connection.unref();
                    });
                } else {
                    if (method === "GET") {
                        let message = parseQuery(device, url);
                        response.statusCode = 200;
                        response.setHeader('Content-Type', 'text/xml; charset=utf-8');
                        response.setHeader('Connection', 'close');

                        response.end(message, () => {
                            request.connection.unref();
                        });
                    } else {
                        parseCommand(node, url);
                        response.end(() => {
                            request.connection.unref();
                        });
                    }
                }
            });
        }).on('error', function (e) {
            // Handle your error here
            node.error(e);
            node.status({ fill: "red", shape: "ring", text: e.message });
        }).listen(configNode.port, configNode.ip, () => {
            node.debug(`fakeroku listening on ${configNode.ip}:${configNode.port}`)
        });

        node.on('close', function () {
            server.close();
        });
        startDiscovery(configNode, socket, device, node);
    }

    function startDiscovery(config: Config, socket: Socket, device: Device, node) {
        socket = createSocket({ type: 'udp4', reuseAddr: true });
        socket.on("error", (error) => {
            node.error(error);
            stopDiscovery(socket);
        });

        socket.on("message", (msg, rinfo) => {
            if (msg.toString().indexOf("M-SEARCH") > -1) {
                let headers = httpHeaders(msg);
                node.debug("Remoteinfo: " + rinfo.address);
                if (headers.man === '"ssdp:discover"') {
                    socket.send(device.SSDP_RESPONSE, 0, device.SSDP_RESPONSE.length, rinfo.port, rinfo.address);
                }
            }
        });

        socket.bind(1900, "0.0.0.0", () => {
            try {
                socket.addMembership((config.multicast && config.multicast.length > 0) ? config.multicast : "239.255.255.250");
            } catch (error) {
                node.error(error);
            }

            node.debug("SSDP socket binding on port 1900");
        });
    }

    function stopDiscovery(socket: Socket) {
        if (socket) socket.close();
    }

    function parseCommand(node: Node, command: string) {
        let message: RegExpMatchArray;
        if (message = command.match(/^\/([^\/]+)\/(\S+)$/)) {
            switch (message[1]) {
                case "keypress":
                case "keydown":
                case "keyup":
                    node.send({
                        action: message[1],
                        payload: message[2]
                    });
                    break;
                case "launch":
                case "install":
                    node.debug(message);
                    break;
                default:
                    break;
            }
        }
    }

    function parseQuery(device: Device, query: string) {
        let message = "";
        switch (query) {
            case "/query/apps":
                message = device.APPSXML;
                break;
            case "/query/device-info":
                message = device.DEVXML;
                break;
            default:
                break;
        }
        return message;
    }

    function init(config: Config): Device {
        let IP = config.ip;
        let UUID = config.uuid;
        let HTTP_PORT = config.port;

        let SSDP_RESPONSE = new Buffer(
            "HTTP/1.1 200 OK\r\nCache-Control: max-age=300\r\nST: roku:ecp\r\nUSN: uuid:roku:ecp:" +
            UUID +
            "\r\nExt: \r\nServer: Roku UPnP/1.0 MiniUPnPd/1.4\r\nLOCATION: " +
            "http://" + IP + ":" + HTTP_PORT +
            "/\r\n\r\n"
        );

        let DESCXML = `<?xml version="1.0" encoding="UTF-8" ?>
        <root xmlns="urn:schemas-upnp-org:device-1-0">
        <specVersion>
        <major>1</major>
        <minor>0</minor>
        </specVersion>
        <device>
        <deviceType>urn:roku-com:device:player:1-0</deviceType>
        <friendlyName>50" TCL Roku TV</friendlyName>
        <manufacturer>TCL</manufacturer>
        <manufacturerURL>support.tcl.com/us</manufacturerURL>
        <modelDescription>Roku Streaming Player Network Media</modelDescription>
        <modelName>7104X</modelName>
        <modelNumber>7104X</modelNumber>
        <modelURL>http://www.roku.com/</modelURL>
        <serialNumber>YN00RF206994</serialNumber>
        <UDN>uuid:29780022-5803-1028-8092-2cd97406a5ec</UDN>
        <iconList>
        <icon>
        <mimetype>image/png</mimetype>
        <width>360</width>
        <height>219</height>
        <depth>8</depth>
        <url>device-image.png</url>
        </icon>
        </iconList>
        <serviceList>
        <service>
        <serviceType>urn:roku-com:service:ecp:1</serviceType>
        <serviceId>urn:roku-com:serviceId:ecp1-0</serviceId>
        <controlURL/>
        <eventSubURL/>
        <SCPDURL>ecp_SCPD.xml</SCPDURL>
        </service>
        <service>
        <serviceType>urn:dial-multiscreen-org:service:dial:1</serviceType>
        <serviceId>urn:dial-multiscreen-org:serviceId:dial1-0</serviceId>
        <controlURL/>
        <eventSubURL/>
        <SCPDURL>dial_SCPD.xml</SCPDURL>
        </service>
        </serviceList>
        </device>
        </root>`;


        let APPSXML = `<apps>
			<app id="11">Roku Channel Store</app>
			<app id="12">Netflix</app>
			<app id="13">Amazon Video on Demand</app>
			<app id="837">YouTube</app>
			<app id="2016">Crackle</app>
			<app id="3423">Rdio</app>
			<app id="21952">Blockbuster</app>
			<app id="31012">MGO</app>  
			<app id="43594">CinemaNow</app>
			<app id="46041">Sling TV</app>
			<app id="50025">GooglePlay</app>
			</apps>`;
        let DEVXML = `This XML file does not appear to have any style information associated with it. The document tree is shown below.
        <device-info>
        <udn>29780022-5803-1028-8092-2cd97406a5ec</udn>
        <serial-number>YN00RF206994</serial-number>
        <device-id>9S67DR206994</device-id>
        <advertising-id>ffd2e4e1-033b-5652-a7c7-6dc8f8786300</advertising-id>
        <vendor-name>TCL</vendor-name>
        <model-name>49S403</model-name>
        <model-number>7104X</model-number>
        <model-region>US</model-region>
        <is-tv>true</is-tv>
        <is-stick>false</is-stick>
        <screen-size>50</screen-size>
        <panel-id>15</panel-id>
        <ui-resolution>1080p</ui-resolution>
        <tuner-type>ATSC</tuner-type>
        <supports-ethernet>true</supports-ethernet>
        <wifi-mac>2c:d9:74:06:a5:ec</wifi-mac>
        <wifi-driver>realtek</wifi-driver>
        <has-wifi-extender>false</has-wifi-extender>
        <has-wifi-5G-support>true</has-wifi-5G-support>
        <can-use-wifi-extender>true</can-use-wifi-extender>
        <ethernet-mac>5c:ad:76:54:0f:33</ethernet-mac>
        <network-type>wifi</network-type>
        <network-name>Who?</network-name>
        <friendly-device-name>50" TCL Roku TV</friendly-device-name>
        <friendly-model-name>TCL•Roku TV</friendly-model-name>
        <default-device-name>TCL•Roku TV - YN00RF206994</default-device-name>
        <user-device-name>50" TCL Roku TV</user-device-name>
        <user-device-location>Your momma</user-device-location>
        <build-number>30C.00E04193A</build-number>
        <software-version>11.0.0</software-version>
        <software-build>4193</software-build>
        <secure-device>true</secure-device>
        <language>en</language>
        <country>US</country>
        <locale>en_US</locale>
        <time-zone-auto>true</time-zone-auto>
        <time-zone>US/Eastern</time-zone>
        <time-zone-name>United States/Eastern</time-zone-name>
        <time-zone-tz>America/New_York</time-zone-tz>
        <time-zone-offset>-240</time-zone-offset>
        <clock-format>12-hour</clock-format>
        <uptime>955</uptime>
        <power-mode>PowerOn</power-mode>
        <supports-suspend>true</supports-suspend>
        <supports-find-remote>false</supports-find-remote>
        <supports-audio-guide>true</supports-audio-guide>
        <supports-rva>true</supports-rva>
        <developer-enabled>false</developer-enabled>
        <keyed-developer-id/>
        <search-enabled>true</search-enabled>
        <search-channels-enabled>true</search-channels-enabled>
        <voice-search-enabled>true</voice-search-enabled>
        <notifications-enabled>true</notifications-enabled>
        <notifications-first-use>true</notifications-first-use>
        <supports-private-listening>true</supports-private-listening>
        <supports-private-listening-dtv>true</supports-private-listening-dtv>
        <supports-warm-standby>true</supports-warm-standby>
        <headphones-connected>false</headphones-connected>
        <supports-audio-settings>false</supports-audio-settings>
        <expert-pq-enabled>1.0</expert-pq-enabled>
        <supports-ecs-textedit>true</supports-ecs-textedit>
        <supports-ecs-microphone>true</supports-ecs-microphone>
        <supports-wake-on-wlan>true</supports-wake-on-wlan>
        <supports-airplay>true</supports-airplay>
        <has-play-on-roku>true</has-play-on-roku>
        <has-mobile-screensaver>true</has-mobile-screensaver>
        <support-url>support.tcl.com/us</support-url>
        <grandcentral-version>7.4.79</grandcentral-version>
        <trc-version>3.0</trc-version>
        <trc-channel-version>6.0.15</trc-channel-version>
        <davinci-version>2.8.20</davinci-version>
        <av-sync-calibration-enabled>1.0</av-sync-calibration-enabled>
        </device-info>
        `

        return {
            UUID: UUID,
            HTTP_PORT: HTTP_PORT,
            SSDP_RESPONSE: SSDP_RESPONSE,
            DESCXML: DESCXML,
            APPSXML: APPSXML,
            DEVXML: DEVXML
        };
    }

    RED.nodes.registerType("fakeroku-device", FakeRokuNode);

}
