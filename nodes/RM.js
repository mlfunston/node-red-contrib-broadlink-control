var Device = require("./Device.js");
var constants = require('./Constants.js');
class RM extends Device {
    constructor(host, mac, devType, timeout = 10) {
        super(host, mac, devType, timeout);

        this.on("payload", (err, payload) => {
            if (constants.RM4.indexOf(devType) > -1) {
                payload.copy(payload, 0, 2);
            }
            console.log("\x1b[31mBroadlink:\x1b[0m Data Received - Determining Type.");
            console.log("\x1b[31mBroadlink:\x1b[0m BroadlinkData",payload);
            var param = payload[0];
            switch (param) {
                case 1: //0x01
                    console.log("\x1b[31m\x1b[31mBroadlink:\x1b[0m\x1b[0m Temperature Data Received - Type 1 Converting and sending.");
                    var temp = (payload[0x4] * 10 + payload[0x5]) / 10.0;
                    this.emit("temperature", temp);
                    break;
                case 2: //0x02
                    console.log("\x1b[31m\x1b[31mBroadlink:\x1b[0m\x1b[0m Success Data Received - Type 2 Data Successful.");
                    break;
                case 3: //0x03
                    console.log("\x1b[31mBroadlink:\x1b[0m Data Received - Data Type 3 Unknown.");
                    ////this.emit("temperature", payload);
                    break;
                case 4: //0x04 get from check_data
                    console.log("\x1b[31mBroadlink:\x1b[0m Standard Data Received - Type 4 Converting and Sending.");
                    var data = Buffer.alloc(payload.length - 4, 0);
                    payload.copy(data, 0, 4);
                    this.emit("data", Array.prototype.slice.call(data, 0));
                    break;
                case 25: //0x19 Scanning RF looking for remote signal lock
                    console.log("\x1b[31mBroadlink:\x1b[0m Data Received - Data Type 25 / 0x19 Waiting for RF Signal Lock from Remote.");
                    break;
                case 26: //0x1a get from check_data
                    console.log("\x1b[31mBroadlink:\x1b[0m Data Received - Type 26 Converting and Sending.");
                    var data = Buffer.alloc(1, 0);
                    payload.copy(data, 0, 0x4);
                    console.log('payload', payload);
                    console.log('data', data);
                    if (data[0] !== 0x1) break;
                    console.log("\x1b[31mBroadlink:\x1b[0m Valid RF Signal Received - RF Signal Locked - Sending Notice to Proceed.");
                    this.emit("rawRFData", data);
                    break;
                case 27: //0x1b get from check_data
                console.log("\x1b[31mBroadlink:\x1b[0m Data Received - Type 27 Converting and Sending.");
                    var data = Buffer.alloc(1, 0);
                    payload.copy(data, 0, 0x4);
                    console.log('payload', payload);
                    console.log('data', data);
                    //if (data[0] !== 0x1) break;
                    console.log("\x1b[31mBroadlink:\x1b[0m Valid RF Button Data Received - Sending RF Data.");
                    this.emit("rawRFData2", data);
                    break;
            }
        });
    }

    checkTemperature() {
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 1;
        } else {
            packet[0] = 1;
        }
        this.sendPacket(0x6a, packet);
    }


    enterLearning() {
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 3;
        } else {
            packet[0] = 3;    
        }
        this.sendPacket(0x6a, packet);
    }
    checkData() {
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 4;
        } else {
            packet[0] = 4;
        }
        this.sendPacket(0x6a, packet);
    }

    sendData(data) {
        var packet;
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet = Buffer.from([0xd0, 0x00, 0x02, 0x00, 0x00, 0x00]);
        } else {
            packet = Buffer.from([0x02, 0x00, 0x00, 0x00]);
        }
        packet = Buffer.concat([packet, data]);
        this.sendPacket(0x6a, packet);
    }

    enterRFSweep() {  // Step 1: Set the RM Unit to RF Learning and sweep through frequencies. User should hold down the remote button to learn
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 0x19;
        } else {
            packet[0] = 0x19;
        }
        //packet[0] = 0x19;
        console.log("\x1b[31mBroadlink:\x1b[0m RF Scan - Sending RF Sweep Command.");
        this.sendPacket(0x6a, packet);
    }

    checkRFData() { // Step 2: Check every innterval to see if the frequency has been found.
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 0x1a;
        } else {
            packet[0] = 0x1a;
        }
        //packet[0] = 0x1a;
        console.log("\x1b[31mBroadlink:\x1b[0m RF Scan - Checking if RF Signal Detected.");
        this.sendPacket(0x6a, packet);
    }

    checkRFData2() { // Step 3: Call the button data from the RF frequency found.
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 0x1b;
        } else {
            packet[0] = 0x1b;
        }
        //packet[0] = 0x1b;
        console.log("\x1b[31mBroadlink:\x1b[0m RF Scan - RF Signal Detected, capturing button data.");
        this.sendPacket(0x6a, packet);
    }

    cancelRFSweep() {
        var packet = Buffer.alloc(16, 0);
        if (constants.RM4.indexOf(this.devType) > -1) {
            packet[0] = 4;
            packet[1] = 0;
            packet[2] = 0x1e;
        } else {
            packet[0] = 0x1e;
        }
        //packet[0] = 0x1e;
        console.log("\x1b[31mBroadlink:\x1b[0m RF Scan - Cancelling RF Sweep.");
        this.sendPacket(0x6a, packet);
    }

}
module.exports = RM;
