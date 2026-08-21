let EventEmitter = require('events');
let dgram = require('dgram');
let os = require('os');
let crypto = require('crypto');
class Device {
    constructor(host, mac, devType, timeout = 10) {
        this.host = host;
        this.mac = mac;
        this.devType = devType;
        // this.devName = devName;
        // this.devCloud = devCloud;
        this.emitter = new EventEmitter();

        this.on = this.emitter.on;
        this.emit = this.emitter.emit;

        this.timeout = timeout;
        this.count = Math.random() & 0xffff;
        this.key = Buffer.from([0x09, 0x76, 0x28, 0x34, 0x3f, 0xe9, 0x9e, 0x23, 0x76, 0x5c, 0x15, 0x13, 0xac, 0xcf, 0x8b, 0x02]);
        this.iv = Buffer.from([0x56, 0x2e, 0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58]);
        this.id = Buffer.from([0, 0, 0, 0]);
        this.cs = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.cs.on('listening', function () {
            //this.cs.setBroadcast(true);
        });
        this.cs.on("message", (response, rinfo) => {
            var enc_payload = Buffer.alloc(response.length - 0x38, 0);
            response.copy(enc_payload, 0, 0x38);

            var decipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
            decipher.setAutoPadding(false);
            var payload = decipher.update(enc_payload);
            var p2 = decipher.final();
            if (p2) {
                payload = Buffer.concat([payload, p2]);
            }

            if (!payload) {
                return false;
            }

            var command = response[0x26];
            var err = response[0x22] | (response[0x23] << 8);

            if (err != 0) return;

            if (command == 0xe9) {
                this.key = Buffer.alloc(0x10, 0);
                payload.copy(this.key, 0, 0x04, 0x14);

                this.id = Buffer.alloc(0x04, 0);
                payload.copy(this.id, 0, 0x00, 0x04);
                this.emit("deviceReady");
            } else if (command == 0xee) {
                this.emit("payload", err, payload);
            }

        });
        this.cs.bind();
        this.type = "Unknown";
    }
    sendPacket(command, payload) {
        this.count = (this.count + 1) & 0xffff;
        var packet = Buffer.alloc(0x38, 0);
        packet[0x00] = 0x5a;
        packet[0x01] = 0xa5;
        packet[0x02] = 0xaa;
        packet[0x03] = 0x55;
        packet[0x04] = 0x5a;
        packet[0x05] = 0xa5;
        packet[0x06] = 0xaa;
        packet[0x07] = 0x55;
        packet[0x24] = this.devType & 0xff;
        packet[0x25] = this.devType >> 8;
        packet[0x26] = command;
        packet[0x28] = this.count & 0xff;
        packet[0x29] = this.count >> 8;
        packet[0x2a] = this.mac[0];
        packet[0x2b] = this.mac[1];
        packet[0x2c] = this.mac[2];
        packet[0x2d] = this.mac[3];
        packet[0x2e] = this.mac[4];
        packet[0x2f] = this.mac[5];
        packet[0x30] = this.id[0];
        packet[0x31] = this.id[1];
        packet[0x32] = this.id[2];
        packet[0x33] = this.id[3];

        var checksum = 0xbeaf;
        for (var i = 0; i < payload.length; i++) {
            checksum += payload[i];
            checksum = checksum & 0xffff;
        }

        //console.log(payload); console.log(this.key, this.iv)

        // Zero-pad the payload to the AES block size and encrypt it without PKCS#7 padding,
        // the same way the Broadlink protocol (and python-broadlink) does it.
        // cipher.update() only returns whole 16 byte blocks and the remainder comes out of
        // cipher.final(), so keeping update() alone truncated every payload whose length was
        // not a multiple of 16: a 538 byte IR frame lost its last 10 bytes and the device
        // rejected it with error -7.
        if (payload.length % 16 !== 0) {
            payload = Buffer.concat([payload, Buffer.alloc(16 - (payload.length % 16), 0)]);
        }
        var cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
        cipher.setAutoPadding(false);
        payload = Buffer.concat([cipher.update(payload), cipher.final()]);
        //console.log(packet);
        //console.log(payload);

        packet[0x34] = checksum & 0xff;
        packet[0x35] = checksum >> 8;

        packet = Buffer.concat([packet, payload]);

        checksum = 0xbeaf;
        for (var i = 0; i < packet.length; i++) {
            checksum += packet[i];
            checksum = checksum & 0xffff;
        }
        packet[0x20] = checksum & 0xff;
        packet[0x21] = checksum >> 8;
        this.cs.send(packet, 0, packet.length, this.host.port, this.host.address);
    }

    auth() {
        var payload = Buffer.alloc(0x50, 0);
        payload[0x04] = 0x31;
        payload[0x05] = 0x31;
        payload[0x06] = 0x31;
        payload[0x07] = 0x31;
        payload[0x08] = 0x31;
        payload[0x09] = 0x31;
        payload[0x0a] = 0x31;
        payload[0x0b] = 0x31;
        payload[0x0c] = 0x31;
        payload[0x0d] = 0x31;
        payload[0x0e] = 0x31;
        payload[0x0f] = 0x31;
        payload[0x10] = 0x31;
        payload[0x11] = 0x31;
        payload[0x12] = 0x31;
        payload[0x1e] = 0x01;
        payload[0x2d] = 0x01;
        payload[0x30] = 'T'.charCodeAt(0);
        payload[0x31] = 'e'.charCodeAt(0);
        payload[0x32] = 's'.charCodeAt(0);
        payload[0x33] = 't'.charCodeAt(0);
        payload[0x34] = ' '.charCodeAt(0);
        payload[0x35] = ' '.charCodeAt(0);
        payload[0x36] = '1'.charCodeAt(0);

        this.sendPacket(0x65, payload);

    }
}
module.exports = Device;