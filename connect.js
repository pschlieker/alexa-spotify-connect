var alexa = require('alexa-app');
var request = require('request-promise');
var express = require('express');
var nodecache = require('node-cache');

var express_app = express();
var cache = new nodecache({ stdTTL: 600, checkperiod: 120 });

var app = new alexa.app('connect');
app.express({ expressApp: express_app });

app.pre = function (req, res, type) {
    if (req.applicationId != "amzn1.ask.skill.2d92e887-178a-4495-9722-1e262832f249" &&
        req.getSession().details.application.applicationId != "amzn1.ask.skill.2d92e887-178a-4495-9722-1e262832f249") {
        throw "Invalid applicationId";
    }
    if (!req.getSession().details.user.accessToken) {
        res.say("Du hast deinen Spotify Account noch nicht verbunden. Überprüfe deine Alexa App um den Account zu verbinden");
        res.linkAccount();
    }
};

app.launch(function (req, res) {
    res.say("Ich kann Spotify Control Geräte steuern. Frage mich deine Geräte zu nennen um zu beginnen.");
    res.reprompt("Frage mich deine Geräte zu nennen um zu beginnen.");
    res.shouldEndSession(false);
});

app.intent("AMAZON.HelpIntent", {
    "slots": {},
    "utterances": []
}, function (req, res) {
    res.say("Du kannst mich fragen dir deine Connect Geräte zu nennen und dann beginnen sie zu steuern.")
    res.say("Frage mich auf einem Gerät zu spielen, nachdem ich dir deine Geräte genannt habe.");
    res.reprompt("Was möchtest du tun?");
    res.shouldEndSession(false);
    return;
});

app.intent("AMAZON.StopIntent", {
    "slots": {},
    "utterances": [
        "stoppen"
    ]
}, function (req, res) {
        request.put("https://api.spotify.com/v1/me/player/pause").auth(null, null, true, req.getSession().details.user.accessToken);
});

app.intent("AMAZON.CancelIntent", {
    "slots": {},
    "utterances": [
        "abzubrechen"
    ]
}, function (req, res) {
    return;
});

app.intent('PlayIntent', {
    "utterances": [
        "spiele",
        "spielen",
        "weiter",
        "Musik zu spielen",
        "Musik anmachen",
        "wiedergabe"
    ]
},
    function (req, res) {
        request.put("https://api.spotify.com/v1/me/player/play").auth(null, null, true, req.getSession().details.user.accessToken);
    }
);

app.intent('PauseIntent', {
    "utterances": [
        "pausieren",
        "pausiere",
        "die Musik zu stoppen"
    ]
},
    function (req, res) {
        request.put("https://api.spotify.com/v1/me/player/pause").auth(null, null, true, req.getSession().details.user.accessToken);
    }
);

app.intent('SkipNextIntent', {
    "utterances": [
        "nächstes",
        "das Lied zu überspringen",
        "das nächste Lied zu spielen",
        "weiter"
    ]
},
    function (req, res) {
        request.post("https://api.spotify.com/v1/me/player/next").auth(null, null, true, req.getSession().details.user.accessToken);
    }
);

app.intent('SkipPreviousIntent', {
    "utterances": [
        "letztes",
        "zurück",
        "das letzte Lied zu spielen",
        "das letzte Lied nochmal zu spielen",
        "das letzte Lied zu wiederholen"
    ]
},
    function (req, res) {
        request.post("https://api.spotify.com/v1/me/player/previous").auth(null, null, true, req.getSession().details.user.accessToken);
    }
);

app.intent('GetDevicesIntent', {
    "utterances": [
        "geräte",
        "nenne",
        "suche",
        "finde",
        "meine Geräte zu nennen",
        "alle Geräte zu nennen",
        "meiner Geräteliste"
    ]
},
    function (req, res) {
        return request.get({
            url: "https://api.spotify.com/v1/me/player/devices",
            auth: {
                "bearer": req.getSession().details.user.accessToken
            },
            json: true
        })
            .then(function (body) {
                var devices = body.devices || [];
                var deviceNames = [];
                for (var i = 0; i < devices.length; i++) {
                    //Number each device
                    deviceNames.push((i + 1) + ". " + devices[i].name);
                    //Add the device number to JSON
                    devices[i].number = (i + 1);
                }
                req.getSession().set("devices", devices);
                cache.set(req.getSession().details.user.userId + ":devices", devices);
                if (devices.length > 0) {
                    //Comma separated list of device names
                    res.say("Ich habe diese Geräte gefunden: ");
                    res.say([deviceNames.slice(0, -1).join(', '), deviceNames.slice(-1)[0]].join(deviceNames.length < 2 ? '' : ', and ') + ". ");
                    res.say("Was möchtest du mit den Geräten tun?").reprompt("Was möchtest du tun?");
                    res.shouldEndSession(false);
                }
                else {
                    res.say("Ich konnte keine verbundenen Geräte finden. Überprüfe deine Alexa App für mehr Information, wie man Geräte verbindet.");
                    res.card({
                        type: "Simple",
                        title: "Gerät mit Spotify Connect verbinden",
                        content: "To add a device to Spotify Connect,"
                        + " log in to your Spotify account on a supported device"
                        + " such as an Echo, phone, or computer"
                        + "\nhttps://support.spotify.com/uk/article/spotify-connect/"
                    });
                }
            })
            .catch(function (err) {
                console.error('error:', err.message);
            });
    }
);

app.intent('DevicePlayIntent', {
    "slots": {
        "DEVICENUMBER": "AMAZON.NUMBER"
    },
    "utterances": [
        "spiele auf {nummer|gerät|geräte nummer|} {-|DEVICENUMBER}",
        "auf {nummer|gerät|geräte nummer|} {-|DEVICENUMBER} zu spielen"
    ]
},
    function (req, res) {
        if (req.hasSession()) {
            if (req.slot("DEVICENUMBER")) {
                if (!isNaN(req.slot("DEVICENUMBER"))) {
                    var deviceNumber = req.slot("DEVICENUMBER");
                    if (req.getSession().isNew()) {
                        //If new session try to use cache
                        var devices = cache.get(req.getSession().details.user.userId + ":devices") || [];
                    }
                    else {
                        var devices = req.getSession().get("devices") || [];
                    }
                    var deviceId, deviceName;
                    for (var i = 0; i < devices.length; i++) {
                        if (devices[i].number == deviceNumber) {
                            deviceId = devices[i].id;
                            deviceName = devices[i].name;
                        }
                    }
                    if (deviceId) {
                        request.put({
                            url: "https://api.spotify.com/v1/me/player",
                            auth: {
                                "bearer": req.getSession().details.user.accessToken
                            },
                            body: {
                                "device_ids": [
                                    deviceId
                                ],
                                "play": true
                            },
                            json: true
                        });
                        res.say("Spiele auf Gerät " + deviceNumber + ": " + deviceName);
                    }
                    else {
                        res.say("Ich konnte kein Gerät " + deviceNumber + " finden. ");
                        res.say("Frage mich dir zuerst deine Geräte zu nennen");
                        res.shouldEndSession(false);
                    }
                }
                else {
                    //Not a number        
                    res.say("Ich konnte nicht herausfinden welches Geräte du meinst. Bitte verwende die Gerätenummern.");
                    res.say("Versuche mich zu fragen auf einem Gerät mit Nummer zu spielen.");
                    res.reprompt("Was möchtest du tun?");
                    res.shouldEndSession(false);
                }
            }
            else {
                //No slot value
                res.say("Ich konnte nicht herausfinden welches Geräte du meinst.");
                res.say("Versuche mich zu fragen auf einem Gerät mit Nummer zu spielen.");
                res.reprompt("Was möchtest du tun?");
                res.shouldEndSession(false);
            }
        }
    }
);

express_app.use(express.static(__dirname));
express_app.get('/', function (req, res) {
    res.redirect('https://github.com/pschlieker/alexa-spotify-connect');
});

app.intent('DeviceTransferIntent', {
    "slots": {
        "DEVICENUMBER": "AMAZON.NUMBER"
    },
    "utterances": [
        "wechsel zu {nummer|gerät|geräte nummer|} {-|DEVICENUMBER}",
        "auf {nummer|gerät|geräte nummer|} {-|DEVICENUMBER} zu wechseln"
    ]
},
    function (req, res) {
        if (req.hasSession()) {
            if (req.slot("DEVICENUMBER")) {
                if (!isNaN(req.slot("DEVICENUMBER"))) {
                    var deviceNumber = req.slot("DEVICENUMBER");
                    if (req.getSession().isNew()) {
                        //If new session try to use cache
                        var devices = cache.get(req.getSession().details.user.userId + ":devices") || [];
                    }
                    else {
                        var devices = req.getSession().get("devices") || [];
                    }
                    var deviceId, deviceName;
                    for (var i = 0; i < devices.length; i++) {
                        if (devices[i].number == deviceNumber) {
                            deviceId = devices[i].id;
                            deviceName = devices[i].name;
                        }
                    }
                    if (deviceId) {
                        request.put({
                            url: "https://api.spotify.com/v1/me/player",
                            auth: {
                                "bearer": req.getSession().details.user.accessToken
                            },
                            body: {
                                "device_ids": [
                                    deviceId
                                ]
                            },
                            json: true
                        });
                        res.say("Wechsle zu Gerät " + deviceNumber + ": " + deviceName);
                    }
                    else {
                        res.say("Ich konnte kein Gerät " + deviceNumber + " finden. ");
                        res.say("Frage mich dir zuerst deine Geräte zu nennen");
                        res.shouldEndSession(false);
                    }
                }
                else {
                    //Not a number        
                    res.say("Ich konnte nicht herausfinden welches Geräte du meinst. Bitte verwende die Gerätenummern.");
                    res.say("Versuche mich zu fragen auf einem Gerät mit Nummer zu spielen.");
                    res.reprompt("Was möchtest du tun?");
                    res.shouldEndSession(false);
                }
            }
            else {
                //No slot value
                res.say("Ich konnte nicht herausfinden welches Geräte du meinst.");
                res.say("Versuche mich zu fragen auf einem Gerät mit Nummer zu spielen.");
                res.reprompt("Was möchtest du tun?");
                res.shouldEndSession(false);
            }
        }
    }
);

app.intent('GetTrackIntent', {
    "utterances": [
        "was läuft gerade",
        "was {gerade|} läuft", 
        "welches lied {läuft gerade | ist das}"
    ]
},
    function (req, res) {
        return request.get({
            url: "https://api.spotify.com/v1/me/player/currently-playing",
            auth: {
                "bearer": req.getSession().details.user.accessToken
            },
            json: true
        })
            .then(function (body) {
                if (body.is_playing) {
                    res.say("Das ist " + body.item.name + " von " + body.item.artists[0].name);
                }
                else {
                    if (body.item.name) {
                        //If not playing but last track known
                        res.say("Das ist " + body.item.name + " von " + body.item.artists[0].name);
                    }
                    else {
                        //If unknown
                        res.say("Es wird gerade kein Lied gespielt.");
                    }
                }
            })
            .catch(function (err) {
                console.error('Fehler:', err.message);
            });
    }
);

//Only listen if run directly, not if required as a module
if (require.main === module) {
    var port = process.env.PORT || 8888;
    console.log("Listening on port " + port);
    express_app.listen(port);
}

module.exports = app;
