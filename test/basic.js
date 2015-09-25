var peers = require('../');
var test = require('tape');

test('initialize', function (t) {
  var p = new peers.Peers();
  t.assert(p, "p is true");
  t.end();
});

test('listen', function (t) {
  var hash = new Buffer(40),
    p = new peers.Peers({
      'loopback' : true
    }),
    timeoutId,
    passed = false;
  p.on("ready", function () {
    console.log('ready event');
    hash.fill(0);
    hash[0] = 1;
    p.announce('1111', hash);
  });
  p.on('peer', function (peer, infoHash) {
    console.log('discovered: ' + peer);
    if (peer.indexOf(':1111', peer.length - 5) !== -1) {
      t.equal(infoHash, hash.toString('hex'));
      passed = true;
      t.pass('got it');
      clearTimeout(timeoutId);
      p.stop();
    }
  });
  p.listen();
  timeoutId = setTimeout(function () {
    if (!passed) {
      t.fail("no discovery");
      p.stop();
    }
  }, 3000);
  t.end();
});
