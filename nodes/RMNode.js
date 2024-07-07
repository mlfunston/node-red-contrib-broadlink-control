module.exports = function (RED) {
    var Broadlink = require("./Broadlink.js");
    function NodeDevice(n) {
        RED.nodes.createNode(this, n);
        this.mac = n.mac.match(/[0-9A-Fa-f]{2}/g) != null ? Buffer.from(n.mac.match(/[0-9A-Fa-f]{2}/g).map(function (num) { return parseInt(num, 16); })) : null;
        this.host = n.host;
        this.devType = n.devType;
        this.folder = n.folder;

        //var node = this;
        //var b = new Broadlink();
        //b.discover();
        //setTimeout(function () {
        //    if (b.devices[n.mac] !== undefined) node.host = b.devices[n.mac].address;
        //}, 3000);
    }
    RED.nodes.registerType("rmdevice", NodeDevice);

    var RM = require("./RM.js");
    function broadlinkNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.on('input', function (msg) {
            var conf = RED.nodes.getNode(config.device);
            var _device;
            if (conf != null && conf != undefined && conf != "") {
                if (conf.devType.length > 0){
                    var _device = new RM({ address: conf.host, port: 80 }, conf.mac, conf.devType);
                }
                else {
                    var _device = new RM({ address: conf.host, port: 80 }, conf.mac, '272a'); //default device type is blank
                }
            }
            else {
                var _device = new RM({ address: msg.payload.host, port: 80 }, Buffer.from(msg.payload.mac.replace(':', '').replace('-', '').match(/[0-9A-Fa-f]{2}/g).map(function (num) { return parseInt(num, 16); })), msg.payload.devType);
            }
            // --- Fix for UDP ports not being closed
            setTimeout( function() {
                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                clearInterval(innterval);
                node.log("Broadlink: Closing Device Connection");
                _device.cs.close();
                _device = null;
            }, 30000); // 30 seconds wait for response from device
            // ---
            _device.auth();

            var innterval;
            _device.on("temperature", (temp) => {
                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                msg.payload.temperature = temp;
                node.status({fill:"green",shape:"dot",text:"Temperature Reading Received"});
                node.send(msg);
            });
            _device.on("data", (temp) => {
                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                msg.payload.data = temp;
                msg.payload.base64data = 
                node.status({fill:"green",shape:"dot",text:"Data Received"});
                node.send(msg);
                clearInterval(innterval);
            });
            _device.on("rawRFData", (temp) => {
                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                msg.payload.data = temp;
                clearInterval(innterval);

                node.warn("Broadlink: Please tap the remote button.");
                node.status({fill:"green",shape:"ring",text:"Learning RF - Please tap remote button"});
                innterval = setInterval(function () { _device.checkRFData2(); }, 1000);
            });
            _device.on("rawRFData2", (temp) => {
                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                msg.payload.data = temp;
                clearInterval(innterval);
                innterval = setInterval(function () { _device.checkData(); }, 1000);
            });
            _device.on("deviceReady", (devm) => {
                node.status({fill:"grey",shape:"ring",text:"Broadlink Device Ready"});
                var _config = { action: config.action, remote: config.remote, button: config.button, fix: config.fix, RFSweep: config.RFSweep, data: undefined };//, repeat: config.repeat _config.repeat = msg.payload.repeat; 
                // Determine msg.payload.data format and process it
                if (_config.action == "_msg_") { 
                    _config.action = msg.payload.action; 
                    _config.remote = msg.payload.remote; 
                    _config.button = msg.payload.button; 
                    _config.fix = msg.payload.fix; 
                    _config.RFSweep = msg.payload.RFSweep; 
                    //_config.data = (msg.payload.data != undefined && typeof (msg.payload.data) == "string") ? JSON.parse(msg.payload.data) : ((msg.payload.data != undefined && typeof (msg.payload.data) == "object") ? msg.payload.data : undefined); 
                    if (msg.payload.data != undefined && typeof (msg.payload.data) == "string") {
                        // JSON data or Base64
                        try {
                            _config.data = JSON.parse(msg.payload.data);
                        } catch (error) {
                            // Not JSON must be Base64
                            node.log("Base64 Data Found");
                            node.status({fill:"blue",shape:"ring",text:"Base64 Data Decoding"});
                            // Check if Base64 Encoded Correctly
                            var regexp = new RegExp('^[A-Za-z0-9+\/=]*$');  // check it only contains valid characters
                            var value = msg.payload.data;
                            if ( typeof value === "string") {
                                var load = value.replace(/\s+/g,'');
                                if (regexp.test(load) && (load.length % 4 === 0) ) {
                                    _config.data = Buffer.from(value,'base64');
                                }
                                else {
                                    // Not correctly Formatted??
                                    node.warn("Data not correctly formatted. Must be object, data string or base64");
                                    node.status({fill:"red",shape:"dot",text:"Data Incorrect"});
                                }
                            }
                        }
                        
                    }
                    else if (msg.payload.data != undefined && typeof (msg.payload.data) == "object") {
                        // Data Object - Send Directly
                        node.status({fill:"blue",shape:"ring",text:"Data Object Found"});
                        _config.data = msg.payload.data
                    }
                    else {
                        // Pull data from the Catalog file
                        node.status({fill:"blue",shape:"ring",text:"Catalog File Request"});
                        _config.data = undefined; 
                    }

                }

                switch (_config.action) {
                    case "learn":
                        if (_config.RFSweep === undefined || _config.RFSweep.toString() == "false") { //No data passed in this field
                            _device.enterLearning();
                            node.status({fill:"green",shape:"ring",text:"Learning IR - Please press remote button"});
                            node.warn("Broadlink: IR Scan - Please tap the remote button within 30 seconds.");
                            innterval = setInterval(function () { _device.checkData(); }, 1000);
                        }
                        else {
                            if (_config.RFSweep.toString() == "true") {
                                _device.enterRFSweep();
                                node.status({fill:"green",shape:"ring",text:"Learning RF - Please long press remote button"});
                                node.warn("Broadlink: RF Scan - Please hold down a button on the RF Remote until scan finishes.");
                                innterval = setInterval(function () { _device.checkRFData(); }, 1000);
                            }
                        }
                        break;
                    case "send":
                        if (_config.data === undefined) { //EG we have not passed a data string to be sent and want to look it up in jsonIRCode
                            node.log("Broadlink: No Data String - Looking up in the Catalog");
                            var options = {};
                            options['encoding'] = "utf8";
                            fs.readFile(conf.folder + "/jsonIrCode", options, function (err, data) {
                                if (err) {
                                    node.error(err);
                                } else {
                                }
                                // Need to validate if _config.button contains valid data
                                try {
                                    var code = JSON.parse(data).filter(function (obj) { if (obj.buttonId == _config.button) { return true; } })[0].code;
                                }
                                catch(err) {
                                    node.error(err);
                                    node.status({fill:"red",shape:"ring",text:"Message Data Error - See Console Log"});
                                }
                                if (_config.repeat != undefined) code[1] = _config.repeat;
                                var _code = [];
                                if (_config.fix == undefined) _config.fix = 1;
                                for (var i = 0; i < _config.fix; i++) {
                                    _code = _code.concat(code);
                                }

                                node.status({fill:"green",shape:"ring",text:"Sending Data"});
                                _device.sendData(Buffer.from(_code));
                                node.status({fill:"green",shape:"dot",text:"Data Sent"});

                                if (typeof (msg.payload) != "object") { msg.payload = {}; }
                                msg.payload.remote = _config.remote;
                                msg.payload.button = _config.button;
                                msg.payload.status = "OK";
                                msg.payload.code = code;
                                msg.payload._code = _code;
                                msg.payload.fix = _config.fix;
                                node.send(msg);
                            });
                        }
                        else {
                           
                           var code = Buffer.from(_config.data);
                            //if (_config.repeat != undefined && code[1] == 0) code[1] = _config.repeat;
                            node.status({fill:"green",shape:"ring",text:"Sending Data"});
                            _device.sendData(code);
                            node.status({fill:"green",shape:"dot",text:"Data Sent"});

                            if (typeof (msg.payload) != "object") { msg.payload = {}; }
                            msg.payload.data = _config.data;
                            msg.payload.status = "OK";
                            node.send(msg);
                        }
                        break;
                    case "temperature":
                        node.status({fill:"green",shape:"ring",text:"Checking Temperature"});
                        _device.checkTemperature();
                        node.status({fill:"green",shape:"dot",text:"Temperature Request Sent"});
                        break;
                }
            });
        });

    }
    RED.nodes.registerType("RM", broadlinkNode);

    RED.httpAdmin.get('/broadlink/scan', RED.auth.needsPermission('broadlink.read'), function (req, res) {
        var b = new Broadlink();
        b.discover();
        setTimeout(function () {
            res.send(b);
        }, 3000);
    });

    let fs = require("fs");
    RED.httpAdmin.get('/broadlink/:id/device', RED.auth.needsPermission('broadlink.read'), function (req, res) {
        var config = RED.nodes.getNode(req.params.id);
        if (config !== null) {
            var options = {};
            options['encoding'] = "utf8";

            fs.readFile(config.folder + "/jsonDevice", options, function (err, data) {
                if (err) {
                } else {
                }
                res.send(data);
            });
        }
    });
    RED.httpAdmin.get('/broadlink/:id/remote', RED.auth.needsPermission('broadlink.read'), function (req, res) {
        var config = RED.nodes.getNode(req.params.id);
        if (config !== null) {
            var options = {};
            options['encoding'] = "utf8";

            fs.readFile(config.folder + "/jsonSubIr", options, function (err, data) {
                if (err) {
                } else {
                }
                res.send(data);
            });
        }
    });
    RED.httpAdmin.get('/broadlink/:id/button', RED.auth.needsPermission('broadlink.read'), function (req, res) {
        var config = RED.nodes.getNode(req.params.id);
        if (config !== null) {
            var options = {};
            options['encoding'] = "utf8";

            fs.readFile(config.folder + "/jsonButton", options, function (err, data) {
                if (err) {
                } else {
                }
                res.send(data);
            });
        }
    });
}