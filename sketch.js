// MQTT client details:
let broker = {
    hostname: 'public.cloud.shiftr.io',
    port: 443
};


// MQTT client:
let client;

let creds = {
    clientID: 'p5Client',
    userName: 'public',
    password: 'public'
}

let topicSound = 'xfab_yclee_sound'; // receives sound sensor values
let topicBtn = 'xfab_yclee_btn'; // receives button trigger events
let topicMotor = 'xfab_yclee_motor'; // sends motor trigger commands


// Matter.js
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;

let engine;
let circles = [];
let counter = 0;


function setup() {
    createCanvas(windowWidth, windowHeight);

    // Create an MQTT client:
    client = new Paho.MQTT.Client(broker.hostname, broker.port, creds.clientID);
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;


    // connect to the MQTT broker:
    client.connect({
        onSuccess: onConnect, // callback function for when you connect
        onFailure: onConnectFailure, // callback function for when connection fails
        userName: creds.userName, // username
        password: creds.password, // password
        //useSSL: true // use SSL
        useSSL: true
    });


    // Matter.js
    engine = Engine.create();

    // Ground
    let ground = Bodies.rectangle(
        width / 2, height - 10,
        width, 20, { isStatic: true }
    );

    World.add(engine.world, ground);

    // Lighter gravity for a floaty, dust-like fall
    engine.world.gravity.y = 0.4;
}

function draw() {
    Engine.update(engine);
    applyAttractor();
    checkCollector();

    background(220);

    // Draw all circles
    fill(0);
    noStroke();

    for (let body of circles) {
        circle(
            body.position.x,
            body.position.y,
            30
        );
    }

    // Counter display, top-right corner
    fill(0);
    textAlign(RIGHT, TOP);
    textSize(20);
    text(counter + '/10', width - 20, 20);
}

// function mousePressed() {
//     launchBalls();
// }

// Launches 10 black balls from the left edge, shooting toward +x
function launchBalls() {
    let originX = 0;
    let originY = height / 3 * 2;

    for (let i = 0; i < 10; i++) {
        let body = Bodies.circle(
            originX,
            originY + random(-10, 10),
            15, {
                restitution: 1,
                friction: 0.01,
                frictionAir: random(0.03, 0.08),
                density: random(0.005, 0.01)
            }
        );

        // launch to the right (+x)
        Body.setVelocity(body, { x: random(8, 14), y: random(-2, 2) });

        World.add(engine.world, body);
        circles.push(body);
    }
}

// function keyPressed() {
//     if (key === ' ') {
//         blowWind();
//         console.log("blow");
//     }
// }

// Blow an upward gust from (width/2, height), only within a 30-degree
// cone (to each side of straight up) that pushes nearby circles up
function blowWind() {
    let source = createVector(random([width / 4, width / 4 * 3]), height / 4 * 5);
    let radius = height; // how far the gust reaches
    let strength = random([0.3, 0.7, 0.8, 0.9, 1]); // force magnitude at the source
    let halfAngle = radians(random(15, 40)); // cone half-angle from straight up

    for (let body of circles) {
        let offset = createVector(
            body.position.x - source.x,
            body.position.y - source.y
        );
        let dist = offset.mag();
        let angleFromUp = atan2(offset.x, -offset.y); // 0 = straight up

        if (dist < radius && abs(angleFromUp) < halfAngle) {
            let falloff = 1 - dist / radius;
            let force = createVector(0, -strength * falloff);
            Body.applyForce(body, body.position, { x: force.x, y: force.y });
        }
    }
}

// Pulls circles toward (width/2, 0) whenever they're within a 100px radius
function applyAttractor() {
    let attractor = createVector(width / 2, 0);
    let radius = 300;
    let strength = 0.03;

    for (let body of circles) {
        let dir = createVector(
            attractor.x - body.position.x,
            attractor.y - body.position.y
        );
        let dist = dir.mag();

        if (dist < radius) {
            dir.normalize();
            dir.mult(strength);
            Body.applyForce(body, body.position, { x: dir.x, y: dir.y });
        }
    }
}

// Removes any circle that enters a 100px radius around (width/2, 0),
// counting each removal; past 10 removals, triggers the motor
function checkCollector() {
    let collectorX = width / 2;
    let collectorY = 0;
    let radius = 100;

    for (let i = circles.length - 1; i >= 0; i--) {
        let body = circles[i];
        let d = dist(body.position.x, body.position.y, collectorX, collectorY);

        if (d < radius) {
            World.remove(engine.world, body);
            circles.splice(i, 1);
            counter++;

            if (counter > 10) {
                triggerMotor('trigger');
                counter = 0;
            }
        }
    }
}

// called when the client connects
function onConnect() {
    console.log('client is connected');
    client.subscribe(topicSound);
    client.subscribe(topicBtn);
}


// called when the initial connection attempt fails
function onConnectFailure(response) {
    console.log('onConnectFailure: ' + response.errorMessage);
}

// called when the client loses its connection
function onConnectionLost(response) {
    if (response.errorCode !== 0) console.log('onConnectionLost:' + response.errorMessage);
}

// called when a message arrives
function onMessageArrived(message) {
    let incomingTopic = message.destinationName;
    let payload = message.payloadString;

    if (incomingTopic === topicSound) {
        console.log('sound value: ' + payload);
        launchBalls();
    } else if (incomingTopic === topicBtn) {
        console.log('button triggered: ' + payload);
        blowWind();
    }
}

// called when you want to trigger the motor:
function triggerMotor(msg) {
    // if the client is connected to the MQTT broker:
    if (client.isConnected()) {
        // start an MQTT message:
        let message = new Paho.MQTT.Message(msg);
        // choose the destination topic:
        message.destinationName = topicMotor;
        // send it:
        client.send(message);
        // print what you sent:
        //console.log('I sent: ' + message.payloadString);
    }
}