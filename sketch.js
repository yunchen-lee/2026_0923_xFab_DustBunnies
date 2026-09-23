// MQTT client details:
let broker = {
    hostname: 'public.cloud.shiftr.io',
    port: 443
};


let lastMotorTriggerTime = -Infinity;
const MOTOR_TRIGGER_COOLDOWN_MS = 3000;


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
let ground, leftWall, rightWall;


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

    createBoundaries();

    // Lighter gravity for a floaty, dust-like fall
    engine.world.gravity.y = 0.4;
}

// Ground + left/right walls, sized to the current canvas
function createBoundaries() {
    ground = Bodies.rectangle(
        width / 2, height - 10,
        width, 20, { isStatic: true }
    );

    leftWall = Bodies.rectangle(-20, height / 2,
        20, height, { isStatic: true }
    );

    rightWall = Bodies.rectangle(
        width + 20, height / 2,
        20, height, { isStatic: true }
    );

    World.add(engine.world, [ground, leftWall, rightWall]);
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
        // 初始化這顆球的眨眼計時器
        if (body.nextBlink === undefined) {
            body.nextBlink = millis() + random(1000, 4000);
            body.blinking = false;
        }

        // 眨眼排程：時間到就開始眨眼，眨完排下一次
        if (!body.blinking && millis() > body.nextBlink) {
            body.blinking = true;
            body.blinkEnd = millis() + 120;
        }
        if (body.blinking && millis() > body.blinkEnd) {
            body.blinking = false;
            body.nextBlink = millis() + random(5000, 20000);
        }

        push();
        translate(body.position.x, body.position.y);
        rotate(body.angle);

        fill(body.shade);
        circle(0, 0, 30);

        // 放射狀小太陽觸角
        push();
        noStroke();
        fill(body.shade);
        for (let i = 0; i < 10; i++) {
            rotate(PI / 5);
            rect(12, -2.5, body.rayLengths[i], 3, 3);
        }
        pop();

        if (body.blinking) {
            // 閉眼：畫兩條線
            stroke(0);
            strokeWeight(2);
            line(-8, -3, -2, -3);
            line(2, -3, 8, -3);
            noStroke();
        } else {
            // 眼睛
            fill(255);
            circle(-5, -3, 6);
            circle(5, -3, 6);

            fill(0);
            circle(-5, -3, 3);
            circle(5, -3, 3);
        }


        pop();
    }


    // Counter display, top-right corner
    fill(0);
    textAlign(RIGHT, TOP);
    textSize(20);
    text(counter + '/10', width - 20, 20);
}

// First click enters fullscreen (browsers block auto-fullscreen on load,
// it must be triggered by a user gesture)
function mousePressed() {
    if (!fullscreen()) {
        fullscreen(true);
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);

    World.remove(engine.world, [ground, leftWall, rightWall]);
    createBoundaries();
}


function tryTriggerMotor() {
    let now = millis();
    if (now - lastMotorTriggerTime >= MOTOR_TRIGGER_COOLDOWN_MS) {
        triggerMotor('trigger');
        lastMotorTriggerTime = now;
    } else {
        console.log('Motor trigger skipped (still in cooldown)');
    }
}

// Launches 10 black balls from the left edge, shooting toward +x
function launchBalls() {
    let originX = 0;
    let originY = height / 3 * 2;

    for (let i = 0; i < 10; i++) {
        // 觸角長度要先決定，才能算出涵蓋 80% 觸角的碰撞半徑
        let rayLengths = [];
        for (let j = 0; j < 10; j++) {
            rayLengths.push(random(6, 16));
        }
        let maxReach = 12 + Math.max(...rayLengths); // 球心到最長觸角尖端
        let physicsRadius = maxReach * 0.8;

        let body = Bodies.circle(
            originX,
            originY + random(-10, 10),
            physicsRadius, {
                restitution: 1,
                friction: 0.01,
                frictionAir: random(0.03, 0.08),
                density: random(0.005, 0.01)
            }
        );

        body.rayLengths = rayLengths;
        body.shade = random([0, 50, 100, 120]);

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

function keyPressed() {
    launchBalls();
}
// Blow an upward gust from (width/2, height), only within a 30-degree
// cone (to each side of straight up) that pushes nearby circles up
function blowWind() {
    let source = createVector(random([width / 5, width / 4, width / 2, width / 4 * 3, width / 5 * 4]), height / 4 * 5);
    let radius = height; // how far the gust reaches
    let strength = random([0.7, 1, 1.5]); // force magnitude at the source
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

            // if (counter > 10) {
            //     triggerMotor('trigger');
            //     counter = 0;
            // }

            if (counter > 10) {
                counter = 0;
                tryTriggerMotor();
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
        if (int(payload) > 3000) {

            launchBalls();

        }


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