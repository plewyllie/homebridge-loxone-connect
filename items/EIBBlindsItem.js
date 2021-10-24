"use strict";

var request = require("request");

var EIBBlindsItem = function(widget,platform,homebridge,factory,posActionUuid, wrActionUuid, motionActionUuid) {

    this.platform = platform;
    this.uuidAction = widget.uuidAction; //to control a dimmer, use the uuidAction
    this.stateUuid = widget.states.position; //a blind always has a state called position, which is the uuid which will receive the event to read
    this.initialValue = true;
    this.inControl = false;
    this.posActionUuid = posActionUuid;
    this.wrActionUuid = wrActionUuid;
    this.motionActionUuid = motionActionUuid;

    //100 means fully open
    this.currentPosition = 100;
    this.targetPosition = 100;
    this.startedPosition = 100;
    this.factory = factory;

    EIBBlindsItem.super_.call(this, widget,platform,homebridge);

    this.positionState = this.homebridge.hap.Characteristic.PositionState.STOPPED;
};

// Register a listener to be notified of changes in this items value
EIBBlindsItem.prototype.initListener = function() {
    this.log("[blinds] Registering listener for EIBBlindsItem " + this.name);
    this.platform.ws.registerListenerForUUID(this.stateUuid, this.callBack.bind(this));
    this.log("[blinds] Registering position listener for EIBBlindsItem " + this.name);
    this.platform.ws.registerListenerForUUID(this.posActionUuid, this.callBack.bind(this));
    this.log("[blinds] Registering motion listener for EIBBlindsItem " + this.name);
    this.platform.ws.registerListenerForUUID(this.motionActionUuid, this.motionFeedback.bind(this));
};

EIBBlindsItem.prototype.callBack = function(value) {
    //function that gets called by the registered ws listener
    this.log("[blinds] Got new state for EIB blind " + value + " and UUID " + this.UUID + " posUUID " + this.posActionUuid);

    //in Homekit, 100% means OPEN while in Loxone this means CLOSED: reverse
    value = parseInt(100 - value);

    if (this.initialValue) {
        // this is the initial value. therfore, also set current targetValue on the same
        this.targetPosition = value;
        this.initialValue = false;
    }
    //if extenal actor changed the blinds, it's important that we set the targetvalue to the new real situation
    if (!this.inControl) {
        this.targetPosition = value;
    }

    // define states for Homekit
    var delta = Math.abs(parseInt(value) - this.targetPosition),
        ps = this.homebridge.hap.Characteristic.PositionState.INCREASING;
    if (delta < 3) {
        //blinds don't always stop at the exact position, so take a margin of 3% here
        ps = this.homebridge.hap.Characteristic.PositionState.STOPPED;
    } else if (parseInt(value) > this.targetPosition){
        ps = this.homebridge.hap.Characteristic.PositionState.DECREASING;
    }

    this.currentPosition = value;

    //also make sure this change is directly communicated to HomeKit
    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
        .updateValue(ps);

     this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.TargetPosition)
        .updateValue(parseInt(this.targetPosition));

    this.otherService
        .getCharacteristic(this.homebridge.hap.Characteristic.CurrentPosition)
        .updateValue(value);

};

EIBBlindsItem.prototype.motionFeedback = function(value) {
  // to listen on KNX motion object
  // value == 0 Not moving
  // value == 1 = Moving
  this.log("[blinds] Got new motion for EIB blind " + value + " and UUID " + this.UUID + " posUUID " + this.motionActionUuid);

  if (!this.inControl) { // if we are in control, PositionState is updated by normal Callback
    if (value == 0) {
      this.log("[blinds] Motion STOPPED UUID " + this.UUID + " posUUID " + this.motionActionUuid);
      this.otherService
          .getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
          .updateValue(this.homebridge.hap.Characteristic.PositionState.STOPPED);
    } else if (value == 1) {
      if (this.currentPosition > 50) { // in homekit 100 == OPEN
        this.log("[blinds] Motion DECREASING UUID " + this.UUID + " posUUID " + this.motionActionUuid);
        this.otherService
            .getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
            .updateValue(this.homebridge.hap.Characteristic.PositionState.DECREASING);
      } else {
        this.log("[blinds] Motion INCREASING UUID " + this.UUID + " posUUID " + this.motionActionUuid);
        this.otherService
            .getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
            .updateValue(this.homebridge.hap.Characteristic.PositionState.INCREASING);
      }
    }
  }
}

EIBBlindsItem.prototype.getOtherServices = function() {
    var otherService = new this.homebridge.hap.Service.WindowCovering();

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.CurrentPosition)
        .on('get', this.getItemCurrentPosition.bind(this))
        .updateValue(this.currentPosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.TargetPosition)
        .on('set', this.setItem.bind(this))
        .on('get', this.getItemTargetPosition.bind(this))
        .updateValue(this.currentPosition);

    otherService.getCharacteristic(this.homebridge.hap.Characteristic.PositionState)
        .on('get', this.getItemPositionState.bind(this))
        .updateValue(this.positionState);

    //console.log("Returning otherService!");
    //console.log(JSON.stringify(otherService, null, 4));

    return otherService;
};

EIBBlindsItem.prototype.getItemPositionState = function(callback) {
    callback(undefined,this.positionState);
};

EIBBlindsItem.prototype.getItemTargetPosition = function(callback) {
    callback(undefined,this.targetPosition);
};

EIBBlindsItem.prototype.getItemCurrentPosition = function(callback) {
    callback(undefined,this.currentPosition);
};

EIBBlindsItem.prototype.setItem = function(value, callback) {
    //sending new state (pct closed) to loxone
    var self = this;

    //set a flag that we're in control. this way we'll know if the action is coming from Homekit or from external actor (eg Loxone app)
    //this flag is removed after 20 seconds (increase if you have really long or slow blinds ;)
    this.inControl =true;
    setTimeout(function(){ self.inControl = false; }, 20000);

    this.startedPosition = this.currentPosition;
    this.targetPosition = parseInt(value);

    var command = parseInt(100 - value); //Loxone expects a value between 0 and 100
    if (typeof this.platform.ws != 'undefined') {
      this.log("[blinds] iOS - send message to " + this.name + ": " + command + " on UUID " + this.wrActionUuid);
      this.platform.ws.sendCommand(this.wrActionUuid, command);
    }
    callback();

};

module.exports = EIBBlindsItem;
