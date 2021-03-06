(function(ext) {

  var versionAM = "2.8";
  
  var INPUT = 0x00,
    OUTPUT = 0x01,
    ANALOG = 0x02,
    PWM = 0x03,
    SERVO = 0x04,
    SHIFT = 0x05,
    I2C = 0x06,
    ONEWIRE = 0x07,
    STEPPER = 0x08,
    ENCODER = 0x09,
    IGNORE = 0x7F;

  var PIN_MODE = 0xF4,
    REPORT_DIGITAL = 0xD0,
    REPORT_ANALOG = 0xC0,
    DIGITAL_MESSAGE = 0x90,
    START_SYSEX = 0xF0,
    END_SYSEX = 0xF7,
    QUERY_FIRMWARE = 0x79,
    REPORT_VERSION = 0xF9,
    ANALOG_MESSAGE = 0xE0,
    ANALOG_MAPPING_QUERY = 0x69,
    ANALOG_MAPPING_RESPONSE = 0x6A,
    CAPABILITY_QUERY = 0x6B,
    CAPABILITY_RESPONSE = 0x6C;
    STRING_DATA = 0x71;

    var LOW = 0, HIGH = 1;

    var poller = null;

    var LOFI_ID = "opdjdfckgbogbagnkbkpjgficbampcel"; // APP ID
    var mConnection;
    var connected = false;
    var mStatus = 0;
    var _selectors = {};

    var digitalOutputData = new Uint8Array(16);
    var analogInputData = new Uint16Array(16);

    var analogRead1, analogRead2, analogRead3, analogRead0;
    var analog0enable = false;
    var analog1enable = false;
    var analog2enable = false;
    var analog3enable = false;

    var pinmode = new Uint8Array(16);
  
    var countdownLockedBySteppers = 50;

    pinmode[2] = 0;
    pinmode[3] = 1;
    pinmode[4] = 0;
    pinmode[5] = 1;
    pinmode[6] = 1;
    pinmode[7] = 0;
    pinmode[8] = 0;
    pinmode[9] = 1;
    pinmode[10] = 1;
    pinmode[11] = 1;
    pinmode[12] = 1;
    pinmode[13] = 1;
    pinmode[14] = 1;
    pinmode[15] = 1;
    pinmode[16] = 1;

    var msg1 = [];
    var previousBuffer = {};

    var servo_smooth = [];
    var servo_position_smooth;

    var lockedByStepper = false;
    var logActive = false;

    var totS1 = 0, 
        totS2 = 0;

    var dist_read  = 0;
    var last_reading = 0;

  function pinMode(pin, mode) {
  var msg = {};
    msg.buffer = [PIN_MODE, pin, mode];
    postAndLogMessage(msg);
    //addPackage(arrayBufferFromArray(msg.buffer), function(){});
  }

  function pinMode_init() {

  pinMode(2,OUTPUT);
  pinMode(4,OUTPUT);
  pinMode(3,PWM);

  pinMode(7,OUTPUT);
  pinMode(8,OUTPUT);
  pinMode(5,PWM);

  pinMode(10,PWM);
  pinMode(9,PWM);
  pinMode(6,PWM);

  pinMode(16,OUTPUT);
  console.log("Pins initialized");
  }

  function valBetween(v, min, max) {
    return (Math.min(max, Math.max(min, v)));
  }

  ext.buzzer = function(stan) {
    var msg = {}
    if (stan == 'marche') {
      msg.buffer = [201,1];
    } else {
      msg.buffer = [201,0];
    }
    postAndLogMessage(msg);
  }

  ext.logToConsole = function(stan) {
    if (stan == 'marche') {
      logActive=true;
      if (logActive==true) {console.log("Logging Started " + versionAM);}
    } else {
      if (logActive==true) {console.log("Logging Stopped " + versionAM);}
      logActive=false;
    }
  }


  ext.setOUTPUT = function(output, value) {

    var msg = {}
    value = valBetween(value,0,100);

     if (output == 'OUTPUT 1') {
       msg.buffer = [204,value];
    }
       if (output == 'OUTPUT 2') {
    msg.buffer = [205,value];
    }
       if (output == 'OUTPUT 3') {
    msg.buffer = [206,value];
    }
       if (output == 'OUTPUT 4') {
    msg.buffer = [207,value];
    }
    
    postAndLogMessage(msg);
  }

  ext.continuousmotor = function(motor,direction,speed) {

    var msg = {};
    speed = valBetween(speed,0,100);

    if (direction == 'reculer' && speed > 0) {
        speed = speed + 100;
    }
    if (direction == 'reculer' && speed == 0) {
        speed = 0;
    }

    if (motor == 'M1') {
     msg.buffer = [202,speed];
    }
    if (motor == 'M2') {
     msg.buffer = [203,speed];
    }

     postAndLogMessage(msg);
  }

  ext.pasapas = function(stepper,direction,speed) {
    var msg = {};

    speed = valBetween(speed,0,10000);
    // lockedByStepper = true;

    if (stepper == 'S1') {
        if (direction == 'avancer') {
             msg.buffer = [214, speed % 100, 215, Math.floor(speed/100), 220, 0];
             totS1 = totS1 + speed;
        } else {
             msg.buffer = [214, speed % 100, 216, Math.floor(speed/100), 220, 0];
             totS1 = totS1 - speed;
        }
    }
    if (stepper == 'S2') {
        if (direction == 'avancer') {
             msg.buffer = [217, speed % 100, 218, Math.floor(speed/100), 220, 0];
             totS2 = totS2 + speed;
        } else {
             msg.buffer = [217, speed % 100, 219, Math.floor(speed/100), 220, 0];
             totS2 = totS2 - speed;
        }
    }
    postAndLogMessage(msg);
  }

  ext.pasapasduo = function(direction1,speed1,direction2,speed2) {
    var msg = {};

    if (logActive==true) {console.log("Start Stepper Duo: " + direction1 + " " + speed1 + " " + direction2 + " " + speed2);}
    
    speed1 = valBetween(speed1,0,10000);
    speed2 = valBetween(speed2,0,10000);

    lockedByStepper = true;

    if ((direction1 == 'avancer') && (direction2 == 'avancer')) {
         msg.buffer = [214, speed1 % 100, 215, Math.floor(speed1/100), 217, speed2 % 100, 218, Math.floor(speed2/100), 220, 0];
         totS1 = totS1 + speed1; totS2 = totS2 + speed2;
   } else if ((direction1 == 'reculer') && (direction2 == 'avancer')) {
         msg.buffer = [214, speed1 % 100, 216, Math.floor(speed1/100), 217, speed2 % 100, 218, Math.floor(speed2/100), 220, 0];
         totS1 = totS1 - speed1; totS2 = totS2 + speed2;
    } if ((direction1 == 'avancer') && (direction2 == 'reculer')) {
         msg.buffer = [214, speed1 % 100, 215, Math.floor(speed1/100), 217, speed2 % 100, 219, Math.floor(speed2/100), 220, 0];
         totS1 = totS1 + speed1; totS2 = totS2 - speed2;
    } else if ((direction1 == 'reculer') && (direction2 == 'reculer')) {
         msg.buffer = [214, speed1 % 100, 216, Math.floor(speed1/100), 217, speed2 % 100, 219, Math.floor(speed2/100), 220, 0];
         totS1 = totS1 - speed1; totS2 = totS2 - speed2;
    }
    if (logActive==true) {console.log("Posting Message " + bufferNumbers(msg));}
    postAndLogMessage(msg);
  }

  ext.stepperMoving = function() {
    return lockedByStepper;
  }
  
  ext.servo_off = function() {
     var msg = {};
     msg.buffer = [212,99];
     postAndLogMessage(msg);
  }

  ext.allstop = function() {
     var msg = {};
     msg.buffer = [213,99];
     postAndLogMessage(msg);
  }

  ext.serwo = function(pin, deg) {

       var msg = {};

       var output;
       if (pin == "OUTPUT 1") {
           output = 208;
       }
       if (pin == "OUTPUT 2") {
           output = 209;
       }
       if (pin == "OUTPUT 3") {
           output = 210;
       }
       if (pin == "OUTPUT 4") {
           output = 211
       }

    deg = valBetween(deg,0,100);
      msg.buffer = [output,Math.round(deg)];

    postAndLogMessage(msg);
  }

  function messageParser(buf) {

    var msg = [];
 
    //if (logActive==true) {console.log("(before) msg1.length=" + msg1.length);}
    //if (logActive==true) {console.log("(before) buf.length =" + buf.length);}
 
    msg.buffer = msg1.concat(buf);
 
    //if (logActive==true) {console.log("(loaded) msg.buffer.length=" + msg.buffer.length);}

    while (msg.buffer.length >=2) {
      //if (logActive==true) {console.log("L(" + msg.buffer.length + ")" +bufferNumbers(msg.buffer));}

      if (msg.buffer[0] <= 199) { 
        if (msg.buffer[0] != 105) {
          if (logActive==true) {console.log("Unexpected character msg.buffer[0]==" + Number(msg.buffer[0]));}
        }
        msg.buffer = msg.buffer.slice(1);
      } else if (msg.buffer[0] > 199) {
      {
        if (msg.buffer[1] <= 100) {
          if (msg.buffer[0] == 224) {
            analogRead0 = Math.round(msg.buffer[1] );
          } else if (msg.buffer[0] == 225) {
            analogRead1 = Math.round(msg.buffer[1] );
          } else if (msg.buffer[0] == 226) {
            analogRead2 = Math.round(msg.buffer[1] );
          } else if (msg.buffer[0] == 227) {
            analogRead3 = Math.round(msg.buffer[1] );
          } else if (msg.buffer[0] == 240) {
            dist_read = Math.round(msg.buffer[1] );
          } else if (msg.buffer[0] == 221) {
            if (msg.buffer[1]==0){
              lockedByStepper = false;
//              if (logActive==true) {console.log("Stepper Unlock");}
//              countdownLockedBySteppers = 0;
            } else {
              lockedByStepper = true;
              if (logActive==true) {console.log("Stepper Lock");}
             countdownLockedBySteppers = 50;
            }
          } else {
            if (logActive==true) {console.log("Unexpected character msg.buffer[0]+msg.buffer[1] ==" + Number(msg.buffer[0]) + " " + Number(msg.buffer[1]));}
          }
        } else {
            if (logActive==true) {console.log("Unexpected character msg.buffer[0]+msg.buffer[1] ==" + Number(msg.buffer[0]) + " " + Number(msg.buffer[1]));}
        }
        msg.buffer = msg.buffer.slice(2);
      }
    }     
    if (msg.buffer[0] == 105) {msg.buffer = msg.buffer.slice(1);}   //ignore
    //if (logActive==true) {console.log("(after) msg.buffer.length=" + msg.buffer.length);}
    //lockedByStepper = false;
    }
    if (msg.buffer.length==1) {msg1=[msg.buffer[0]];} else {msg1=[];}
  }

  ext.readINPUTanalog = function(input) {

    var reading = 0;
    var msg = {};

    if (input == 'INPUT 1'){
      reading = analogRead0;
    }
    if (input == 'INPUT 2'){
      reading = analogRead1;
    }
    if (input == 'INPUT 3'){
      reading = analogRead2;
    }
    if (input == 'INPUT 4'){
      reading = analogRead3;
    }
        
    return reading;
  }

  ext.setStepperToZero = function() {
    totS1 = 0;
    totS2 = 0;
  }

  ext.readStepper = function(input) {
    if (input == 'S1'){
      return totS1;
    } else if (input == 'S2'){
      return  totS2;
    }
  }

  ext.readUltrasound = function(input) {

    //var msg = new Uint8Array([0xF0,0x08,14,0xF7]);
    //device.send(msg.buffer);

    var msg = {};
    msg.buffer = [0xF0,0x08,14,0xF7];
    //240 8 14 247

    //mConnection.postMessage(msg);

      var distance = dist_read;
      if (distance == 0) {
      distance = 1000;
      }

  return distance;
  }

  var descriptor = {

    

        blocks: [
            [' ', 'Activer le moteur continu %m.motor en mode %m.direction à la puissance %n', 'continuousmotor', 'M1','avancer', 100],
            [' ', 'Activer le moteur pas-à-pas %m.stepper en mode %m.direction à une valeur de %n', 'pasapas', 'S1','avancer', 2048],
            [' ', 'Activer les moteurs pas-à-pas S1 en mode %m.direction à une valeur de %n et S2 en mode %m.direction à une valeur de %n', 'pasapasduo', 'avancer', 2048, 'avancer', 2048],
            [' ', 'Fixer la sortie %m.output à la valeur %n%', 'setOUTPUT', 'OUTPUT 1', 100],
            [' ', 'Activer le servo %m.output à un angle de %n', 'serwo', 'OUTPUT 1', 0],
            [' ', 'Buzzer %m.stan', 'buzzer', 'marche'],
            ['r', 'Télémètre', 'readUltrasound', 'INPUT 1'],
            ['r', 'Lire %m.input', 'readINPUTanalog', 'INPUT 1'],
            ['r', 'Écheloner %n de %n %n à %n %n', 'mapValues', 50, 0, 100, -240, 240],
            ['-'],
            ['b', 'Un moteur pas-à-pas fonctionne', 'stepperMoving'],
            ['-'],
            [' ', 'Logging Actif %m.stan', 'logToConsole', 'marche'],
            [' ', 'Tout arrêter', 'allstop'],
            ['-'],
            [' ', 'Mettre les positions des Steppers à zéro', 'setStepperToZero'],
            ['r', 'Lire position Stepper %m.stepper', 'readStepper', 'S1'],
            ['-']
            ],
        menus: {

      motor: ['M1','M2'],
      stepper: ['S1','S2'],
      direction: ['avancer', 'reculer'],
      input: ['INPUT 1','INPUT 2','INPUT 3','INPUT 4'],
      output: ['OUTPUT 1','OUTPUT 2', 'OUTPUT 3', 'OUTPUT 4'],
      stan: ['marche', 'arrêt']
        }
  };

  ext._getStatus = function() {
    return {status: mStatus, msg: mStatus==2?'Ready':'Not Ready'};
  };

  ext._shutdown = function() {
    if(poller) poller = clearInterval(poller);
    status = false;
  }

  function getAppStatus() {
    chrome.runtime.sendMessage(LOFI_ID, {message: "STATUS"}, function (response) {
      if (response === undefined) { //Chrome app not found
         console.log("Chrome app not found");
         mStatus = 0;
         setTimeout(getAppStatus, 1000);
      } else if (response.status === false) { //Chrome app says not connected
        mStatus = 1;
        setTimeout(getAppStatus, 1000);
        //console.log("Not Connected");
      } else {// successfully connected
        if (mStatus !==2) {
          mConnection = chrome.runtime.connect(LOFI_ID);
          mConnection.onMessage.addListener(onMsgApp);
          connected = true;
          //console.log("Connected");
          //pinMode_init();
        }
        //                mStatus = 1; 
        setTimeout(getAppStatus, 1000);
      }
    });
  };

  function postAndLogMessage(m) {
//    var buf = m.buffer;
//    var logmsg = "S:" ;
//    for (var i=0; i<buf.length; i++) {
//      logmsg = logmsg + Number(buf[i]) + " ";
//    }
    if (logActive==true) {console.log("S: " + bufferNumbers(m.buffer));}
    mConnection.postMessage(m);
  }

  function consoleLog(buf) {
    if (logActive==true) {console.log(bufferNumbers(buf));}
  }

  function bufferNumbers(buf) {
    var st = "";
    for (var i=0; i<buf.length; i++) {
      st = st + Number(buf[i]) + " ";
    }
    return st;
  }

  function onMsgApp(msg) {
    mStatus = 2;
    var buffer = msg.buffer;

//    if (logActive==true) {console.log("R:"+bufferNumbers(buffer));}
    if (checkEqualBuffers(buffer,previousBuffer)==false) {
      previousBuffer = buffer;
      messageParser(buffer);
    } 

    if (countdownLockedBySteppers==2) {
      if (logActive==true) {console.log("Simulated Stepper Lock");}
      lockedByStepper = true;
      countdownLockedBySteppers=50;
    } else {
      countdownLockedBySteppers = countdownLockedBySteppers -1;
    }
    /*
    if (countdownLockedBySteppers<=0) {
      lockedByStepper = false;
      if (logActive==true) {console.log("Simulated Stepper Unlock");}
      countdownLockedBySteppers=1000;
    } 
    */

  }

  function checkEqualBuffers(buf1, buf2) {
    if (buf1.length != buf2.length) return false;
    if (buf1.length == 0) return true;
    for (var i=0; i<buf1.length; i++) {
      if (buf1[i] != buf2[i]) return false;
    }
    return true;
  }

  getAppStatus();

  ScratchExtensions.register('LOFI Robot Chrome v4.10.AM', descriptor, ext);

  ext.mapValues = function(val, aMin, aMax, bMin, bMax) {
    var output = (((bMax - bMin) * (val - aMin)) / (aMax - aMin)) + bMin;
    return Math.round(output);
  };

})({});
