var net = require('net'),
    dgram = require('dgram'),
    util = require('util'),
    events = require('events');

var Peers = function(options) {
    events.EventEmitter.call(this);
    
    options = options || {}

    this.id = options.id || Math.floor(Math.random() * 10000);
    this.protocol = options.protocol || this.protocol;
    this.port = options.port || 2104;
    
    // Peer list and discovery
    this.peer_list = []

    this.discovery = {}
    this.discovery.auto = options.auto_discover || true;
    this.discovery.interval = options.interval || 1000; // Attempt to discover a peer every minute.
    this.discovery.identify = options.identify || true;
    
    // Multicast options
    var multicast = {}
    this.multicast = multicast;
    this.multicast.membership = options.membership || [ '239.5.5.1' ];
    this.multicast.loopback = options.loopback || false;
    this.multicast.ttl = options.ttl || 1;
    this.listen = dgram.createSocket('udp4');
}
util.inherits(Peers, events.EventEmitter);

Peers.prototype.initialize = function () {    
    var self = this;
    
    self.listen.on('listening', function() {
	self.multicast.membership.forEach(function(group) {
	    self.listen.addMembership(group);
	});
	
	setInterval(function() {
	    if (self.discovery.auto) {
		self.discover();
	    }
	}, self.discovery.interval);
	
	self.listen.setMulticastTTL(self.multicast.ttl);
	self.listen.setMulticastLoopback(self.multicast.loopback);
    });
    
    self.listen.on('message', function(msg, rinfo) {
	self.discovered(self, msg, rinfo);
    });
    
    self.listen.bind(self.port);
}


Peers.prototype.discover = function() {
    var self = this;

    // Send out a discover packet with a callback for responses
    self.multicast.membership.forEach(function (group) {
	var exchange = new Buffer(self.id.toString());
	self.listen.send(exchange, 0, exchange.length, self.port, group);
    });
}


Peers.prototype.discovered = function(self, msg, rinfo) {
    // A peer responed. Either add him to the list or not.

    if (self.discovery.identify) {
	var peer = msg.toString();
	
	if (self.peer_list.indexOf(peer) == -1) {
	    self.peer_list.push(peer);
	}
    }

    self.emit('discovered', msg, rinfo);    
}

Peers.prototype.peers = function() {
    return this.peer_list;
}

exports.Peers = Peers;
