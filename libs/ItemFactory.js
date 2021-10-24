const moduleexports = module.exports = {};
moduleexports.AbstractItem = require('../items/AbstractItem.js');
//Important: name the exports identical to Loxone type to have an automatic match
//If not possible, define in checkCustomAttrs which will override in certain cases

moduleexports.LightControllerV2MoodSwitch = require('../items/LightControllerV2MoodSwitchItem.js');
moduleexports.TemperatureSensor = require('../items/TemperatureSensorItem.js');
moduleexports.Trigger = require('../items/TriggerItem.js');
moduleexports.HumiditySensor = require('../items/HumiditySensorItem.js');
moduleexports.Switch = require('../items/SwitchItem.js');
moduleexports.TimedSwitch = require('../items/TimedSwitchItem.js');
moduleexports.Lightbulb = require('../items/LightbulbItem.js');
moduleexports.Outlet = require('../items/OutletItem.js');
moduleexports.Fan = require('../items/FanItem.js');
moduleexports.Dimmer = require('../items/DimmerItem.js');
moduleexports.Jalousie = require('../items/BlindsItem.js');
moduleexports.Pushbutton = require('../items/PushbuttonItem.js');
moduleexports.Colorpicker = require('../items/ColorpickerItem.js');
moduleexports.Gate = require('../items/GateItem.js');
moduleexports.Doorbell = require('../items/DoorBellItem');
moduleexports.MotionSensor = require('../items/MotionSensorItem.js');
moduleexports.ContactSensor = require('../items/ContactSensorItem.js');
moduleexports.LightSensor = require('../items/LightSensorItem.js');
moduleexports.SmokeSensor = require('../items/SmokeSensorItem.js');
moduleexports.LeakSensor = require('../items/LeakSensorItem.js');
moduleexports.Alarm = require('../items/AlarmItem.js');
moduleexports.Lock = require('../items/LockItem.js');
moduleexports.Valve = require('../items/ValveItem.js');
moduleexports.Sprinkler = require('../items/SprinklerItem.js');
// Pieter adding KNX Blinds
moduleexports.EIBBlinds = require('../items/EIBBlindsItem.js');

moduleexports.Factory = function(LoxPlatform, homebridge) {
    this.platform = LoxPlatform;
    this.alias = this.platform.alias;
    this.log = this.platform.log;
    this.homebridge = homebridge;
    this.itemList = {};
    this.catList = {};
    this.roomList = {};

    this.list_child_pos_UUID = {};
    // Loxone items should be named "Screen [ROOM] [function]"
    // [function] == Op_Neer => Main EIBBlindsItem which will have actions, status and be used in HomeKit
    // [function] == Positie FeedBack => "Dummy item (EIBBlindsPositionItem) receiving the value and updating Op_Neer EIBBlindsItem"
};

moduleexports.Factory.prototype.sitemapUrl = function() {
    let serverString = this.platform.host;
    const serverPort = this.platform.port;
    if (this.platform.username && this.platform.password) {
        serverString = `${encodeURIComponent(this.platform.username)}:${encodeURIComponent(this.platform.password)}@${serverString}:${serverPort}`;
    }

    return `${this.platform.protocol}://${serverString}/data/LoxApp3.json`;
};

moduleexports.Factory.prototype.parseSitemap = function(jsonSitemap) {

    //this is the function that gets called by index.js
    //first, parse the Loxone JSON that holds all controls
    moduleexports.Factory.prototype.traverseSitemap(jsonSitemap, this);
    //now convert these controls in accessories
    const accessoryList = [];

    for (const key in this.itemList) {
        if (this.itemList.hasOwnProperty(key)) {
            //process additional attributes
            this.itemList[key] = moduleexports.Factory.prototype.checkCustomAttrs(this, key, this.platform, this.catList);

            if (!(this.itemList[key].type in moduleexports)){
                this.log(`Platform - The widget '${this.itemList[key].name}' of type ${this.itemList[key].type} is an item not handled.`);
                continue;
            }
            if (this.itemList[key].skip) {
                this.log(`Platform - The widget '${this.itemList[key].name}' of type ${this.itemList[key].type} was skipped.`);
                continue;
            }

            var accessory = null;
            if (this.itemList[key].name.startsWith("Screen Slaapkamer")) { // KNX Screen special treatment
              var access_name = this.itemList[key].name.split(" ");
              if ((access_name.length > 2) && (access_name[2] == "Op_Neer")) {
                // assign "Positie" callback UUID to "Op_Neer" main Blinds item
                accessory = new moduleexports[this.itemList[key].type](this.itemList[key], this.platform, this.homebridge,
                  this.list_child_pos_UUID[access_name[1]], this.list_child_pos_UUID[access_name[1] + "EIBDimmer"],
                  this.list_child_pos_UUID[access_name[1] + "Motion"]);
                this.log("Platform - Accessory Found (Screen): " + this.itemList[key].name + " Type " + this.itemList[key].type);
              } else {
                continue; // If this continue; is not here, we can add an empty item to the accesory list
              }
            } else {
              accessory = new moduleexports[this.itemList[key].type](this.itemList[key], this.platform, this.homebridge);
              this.log("Platform - Accessory Found: " + this.itemList[key].name + " Type " + this.itemList[key].type);
            }

            if (accessoryList.length > 99) {
                this.log(`Platform - Accessory count limit (100) exceeded so skipping: '${this.itemList[key].name}' of type ${this.itemList[key].type} was skipped.`);
            } else {
                let keyToLookup = key;
                if (keyToLookup.indexOf('/') > -1) {
                    keyToLookup = keyToLookup.split('/')[0];
                }

                const control = this.itemList[keyToLookup];

                let controlRoom = null;

                if (this.platform.rooms.length == 0) {
                    //Show all rooms
                    accessoryList.push(accessory);

                } else {
                    //Filter rooms
                    if (control.room) {
                        // The controls room is not defined if the room "Not used" is assigned via the Config
                        controlRoom = this.roomList[control.room].name;

                        //this.log(this.platform.rooms);
                        //this.log(controlRoom);

                        if (this.platform.rooms.indexOf(controlRoom) >= 0) {

                            if ((this.platform.moodSwitches == 'only') && (this.itemList[key].type !== 'LightControllerV2MoodSwitch')) {
                                this.log('Skipping as only moodswitched selected');
                            } else {
                                accessoryList.push(accessory);
                            }
                        } else {
                            this.log(`Platform - Skipping as room ${controlRoom} is not in the config.json rooms list.`);
                        }

                    } else {
                        // cannot add this accessory as it does not have a room
                        this.log('Platform - Skipping as could not determine which room the accessory is in.');
                    }
                }
            }
        }
    }

    this.log(`Platform - Total accessory count ${accessoryList.length} across ${this.platform.rooms.length} rooms.`);
    return accessoryList;
};


moduleexports.Factory.prototype.checkCustomAttrs = (factory, itemId, platform, catList) => {
    const item = factory.itemList[itemId];
    const alias = factory.alias;

    if (item.name.indexOf("Screen") !== -1) { // KNX Screens
      console.log("Found EIB Blinds!! :-) " + item.name);
      var access_name = item.name.split(" ");
      if (access_name.length < 3) {
        console.log("Invalid Screen " + access_name +  " needs to be in format Screen Room Function");
        // Function should be Op_Neer for the main blind item
        // Function should be Positie to subscribe on the position uuid
        // Function should be EIBDimmer to send value on a group address to set the blind position
      }
      //console.log(JSON.stringify(item, null, 4));

      var room = item.name.split(" ")[1];
      if (item.type == "UpDownDigital") {
        item.type = "EIBBlinds";
      } else if (item.type == "InfoOnlyAnalog") {
        if (access_name[2] == "Positie") {
          factory.list_child_pos_UUID[access_name[1]] = item.uuidAction; // UUID to listen on for position info
        } //else if (access_name[2] == "Go2PosKNX") {
          //factory.list_child_pos_UUID[access_name[1] + "Go2PosKNX"] = item.uuidAction; // UUID to listen on for position info
        //}
      } else if (item.type == "EIBDimmer") {
        factory.list_child_pos_UUID[access_name[1] + "EIBDimmer"] = item.uuidAction;
      } else if (item.type == "InfoOnlyDigital") {
        factory.list_child_pos_UUID[access_name[1] + "Motion"] = item.uuidAction;
      }
    }

    //this function will make accesories more precise based on other attributes

    if (item.type == "InfoOnlyAnalog") {
        if (item.name.startsWith(alias['Contact'])) {
            item.type = "ContactSensor";
        } else if (item.name.startsWith(alias['Doorbell'])) {
            item.type = "Doorbell";
        } else if (item.name.startsWith(alias['Motion'])) {
            item.type = "MotionSensor";
        } else if (item.name.startsWith(alias['Brightness'])) {
            item.type = "LightSensor";
        } else if (item.name.startsWith(alias['Trigger'])) {
            item.type = "Trigger";
        }else if (item.name.startsWith(alias['Temperature'])) {
            item.type = "TemperatureSensor";
        }else if (item.name.startsWith(alias['Humidity'])) {
            item.type = "HumiditySensor";
        }else if (item.name.startsWith(alias['Smoke'])) {
            item.type = "SmokeSensor";
        }else if (item.name.startsWith(alias['Leak'])) {
            item.type = "LeakSensor";
        }

        // KNX Blinds
        if (item.type === "EIBDimmer") {
          item.type = "Dimmer"
        }
    }

    if (item.type == "TimedSwitch") {
        item.type = "TimedSwitch";
    }

    if (item.type == "Alarm") {
        item.type = "Alarm";
    }

    if (item.type == "Jalousie") {
        item.type = "Jalousie";
    }

    if(item.type === "Switch") {
        if(catList[item.cat] !== undefined){
            if (catList[item.cat].image === "00000000-0000-0002-2000000000000000.svg") {
                item.type = "Lightbulb";
            } else if (catList[item.cat].image === "00000000-0000-002d-2000000000000000.svg") {
                item.type = "Outlet";
            }
        }

        if (item.name.startsWith(alias['Outlet'])) {
            item.type = "Outlet";
        }

        if (item.name.startsWith(alias['Fan'])) {
            item.type = "Fan";
        }

        if (item.name.startsWith(alias['Lighting'])) {
            item.type = "Lightbulb";
        }

        if (item.name.startsWith(alias['Lock'])) {
            item.type = "Lock";
        }

        if (item.name.startsWith(alias['Valve'])) {
            item.type = "Valve";
        }

        if (item.name.startsWith(alias['Sprinklers'])) {
            item.type = "Sprinkler";
        }
    }

    if (item.parentType === "LightController" || item.parentType === "LightControllerV2") {
        if(item.type === "Switch") {
            item.type = "Lightbulb";
        } else if (item.type === "ColorPickerV2") {
            item.type = "Colorpicker";
        }
    }

    if (item.type === alias['Gate']) {
        item.type = "Gate";
    }

    if (item.type === "EIBDimmer") {
        item.type = "Dimmer"
    }

    if(item.name.indexOf("Loxone") !== -1) {
        //this is a Loxone status or temperature
        item.skip = true;
    }

    if ((item.uuidAction.indexOf("/masterValue") !== -1) || (item.uuidAction.indexOf("/masterColor") !== -1)) {
        // the 'Overall Brightness' and 'Overall Color' features of the new Loxone LightController2 don't really have a context in Homekit, skip them
        item.skip = true;
    }

    item.manufacturer = "Loxone";

    return item;
};


moduleexports.Factory.prototype.traverseSitemap = (jsonSitmap, factory) => {

    //this function will simply add every control and subControl to the itemList, holding all its information
    //it will also store category information, as we will use this to decide on correct Item Type
    for (const sectionKey in jsonSitmap) {
        if (jsonSitmap.hasOwnProperty(sectionKey)) {
            if (sectionKey === "cats") {
                const cats = jsonSitmap[sectionKey];
                for (const catUuid in cats) {
                    if (cats.hasOwnProperty(catUuid)) {
                        factory.catList[catUuid] = cats[catUuid];
                    }
                }
            } else if (sectionKey === "rooms") {
                const rooms = jsonSitmap[sectionKey];
                for (const roomUuid in rooms) {
                    if (rooms.hasOwnProperty(roomUuid)) {
                        factory.roomList[roomUuid] = rooms[roomUuid];
                    }
                }
            } else if (sectionKey === "controls") {
                const controls = jsonSitmap[sectionKey];
                for (const controlUuid in controls) {
                    if (controls.hasOwnProperty(controlUuid)) {
                        const control = controls[controlUuid];
                        let controlRoom = "'No Room'";

                        // The controls room is not defined if the room "Not used" is assigned via the Config
                        if (control.room) {
                            controlRoom = factory.roomList[control.room];
                        }

                        // Append the room name to the name for better identification
                        //control.name += (" in " + controlRoom.name);
                        control.roomname = controlRoom.name;
                        factory.itemList[controlUuid] = control;

                        // Check if the control has any subControls like LightController(V2)
                        if (control.subControls) {
                            for (const subControlUuid in control.subControls) {
                                if (control.subControls.hasOwnProperty(subControlUuid)) {
                                    const subControl = control.subControls[subControlUuid];
                                    subControl.parentType = control.type;

                                    // Append the name of its parent control to the subControls name
                                    subControl.name += (` of ${control.name}`);
                                    factory.itemList[subControlUuid] = subControl;

                                }
                            }
                        }

                        // if we have a LightController(V2) then we create a new control (switch) for each Mood
                        if ((control.type == 'LightControllerV2') && ((factory.platform.moodSwitches == 'all') || (factory.platform.moodSwitches == 'only'))) {
                            const moods = JSON.parse(factory.platform.ws.getLastCachedValue(control.states.moodList));

                            //factory.log(moods.length);
                            for (const mood of moods) {
                                // create a control for LightControllerV2MoodSwitch for each Mood of this LightControllerV2
                                const moodSwitchControl = JSON.parse(JSON.stringify(control));
                                moodSwitchControl.subControls = null;
                                moodSwitchControl.uuidAction = `${controlUuid}/${mood.id}`;
                                moodSwitchControl.name = `Mood ${mood.name} of ${control.name}`;
                                moodSwitchControl.parentType = control.type;
                                moodSwitchControl.uuidActionOriginal = controlUuid;
                                moodSwitchControl.mood = mood;
                                moodSwitchControl.type = 'LightControllerV2MoodSwitch';
                                factory.itemList[moodSwitchControl.uuidAction] = moodSwitchControl;
                            }
                        }
                    }
                }
            }
        }
    }
};
