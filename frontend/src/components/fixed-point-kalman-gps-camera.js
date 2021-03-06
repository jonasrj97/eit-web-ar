
/* eslint-disable */
import AFRAME from "aframe";
import * as utils from "../modules/utils";
import KalmanFilter from "../modules/kalman";

const log = utils.getLogger("components:fixed-point-kalman-gps-camera");

AFRAME.registerComponent('fixed-point-kalman-gps-camera', {
  _watchPositionId: null,
  originCoords: null,
  currentCoords: null,
  lookControls: null,
  heading: null,
  gpsTimestampArray: [], // MODIFICATION
  gpsVelocity: 0, // MODIFICATION
  schema: {
    Q: { type: 'float', default: 2 }, // MODIFICATION
    R: { type: 'float', default: 0.1 }, // MODIFICATION
    B: { type: 'float', default: 1 }, // MODIFICATION
    logConsole: { type: 'boolean', default: false }, // MODIFICATION
    radius: { type: 'float', default: 0}, //RADIUS OF MODEL AREA
    simulateLatitude: {
      type: 'number',
      default: 0,
    },
    simulateLongitude: {
      type: 'number',
      default: 0,
    },
    simulateAltitude: {
      type: 'number',
      default: 0,
    },
    positionMinAccuracy: {
      type: 'int',
      default: 100,
    },
    alert: {
      type: 'boolean',
      default: false,
    },
    minDistance: {
      type: 'int',
      default: 0,
    },
    maxDistance: {
      type: 'int',
      default: 0,
    }
  },
  update: function () {
    if (this.data.simulateLatitude !== 0 && this.data.simulateLongitude !== 0) {
      localPosition = Object.assign({}, this.currentCoords || {});
      localPosition.longitude = this.data.simulateLongitude;
      localPosition.latitude = this.data.simulateLatitude;
      localPosition.altitude = this.data.simulateAltitude;
      this.currentCoords = localPosition;

      // re-trigger initialization for new origin
      this.originCoords = null;
      this._updatePosition();
    }
  },
  init: function () {
    var SetCoords = [0, 0];
    this.Radius = this.data.radius;
    this.poi_distance = 99999;

    // When submitting gps coordinations through the app, do the following:
    document.getElementById('submit_gps_coords').addEventListener('click', () => {
      // Get submitted coords
      const lat = parseFloat(document.getElementById('lat_pos').value);
      const lng = parseFloat(document.getElementById('lng_pos').value);
      
      // Put element at the submitted coords
      this.location = { "lat": lat, "lng": lng }

      var newLocation = { "lat": this.location.lat + 0.000012*3, "lng": this.location.lng + 0.000248*3 }
      document.getElementById('lookout_tower_ent').setAttribute('gps-object', `location: { "lat": ${newLocation.lat}, "lng": ${newLocation.lng} }`);
      document.getElementById('eiffel_tower_ent').setAttribute('gps-object', `location: { "lat": ${this.location.lat}, "lng": ${this.location.lng} }`);
      
      SetCoords[0] = lat;
      SetCoords[1] = lng;

      this._updatePoiArray(SetCoords, this.globalCurrentPosition, this.Radius);
    });

    // When submitting your current gps position, do the following:
    document.getElementById('submit_current_position').addEventListener('click', () => {
      // Get current position
      var currentPos = this.globalCurrentPosition;
      //console.log(currentPos);
      this.location = { "lat": currentPos.coords.latitude, "lng": currentPos.coords.longitude }
      
      var newLocation = { "lat": currentPos.coords.latitude + 0.000012*8, "lng": currentPos.coords.longitude + 0.000248*8 }
      document.getElementById('lookout_tower_ent').setAttribute('gps-object', `location: { "lat": ${newLocation.lat}, "lng": ${newLocation.lng} }`);
      document.getElementById('eiffel_tower_ent').setAttribute('gps-object', `location: { "lat": ${currentPos.coords.lat}, "lng": ${currentPos.coords.lng} }`);
      // Set input fields to current pos
      document.getElementById('lat_pos').value = currentPos.coords.latitude;
      document.getElementById('lng_pos').value = currentPos.coords.longitude;

      SetCoords[0] = currentPos.coords.latitude;
      SetCoords[1] = currentPos.coords.longitude;

      this._updatePoiArray(SetCoords, this.globalCurrentPosition, this.Radius);
    });

    if (!this.el.components['look-controls']) {
      return;
    }

    this.loader = document.createElement('DIV');
    this.loader.classList.add('arjs-loader');
    document.body.appendChild(this.loader);

    // *****
    // MODIFICATION: Sette riktig kamera komponent til alle gps-entity-places._cameraGps
    let gpsEntityPlaces = this.el.sceneEl.querySelectorAll('[gps-entity-place]');
    let KalmanGpsCamera = this.el;

    for (var i = 0; i < gpsEntityPlaces.length; ++i) {
      let gpsComponent = gpsEntityPlaces[i].components['gps-entity-place'];
      gpsComponent._cameraGps = KalmanGpsCamera.components['fixed-point-kalman-gps-camera'];
    }
    // *****

    window.addEventListener('gps-entity-place-added', function () {
      // if places are added after camera initialization is finished
      if (this.originCoords) {
        // *****
      // MODIFICATION: Sette riktig kamera komponent til alle gps-entity-places._cameraGps
      let gpsEntityPlaces = this.el.sceneEl.querySelectorAll('[gps-entity-place]');
      let KalmanGpsCamera = this.el;

      for (var i = 0; i < gpsEntityPlaces.length; ++i) {
        let gpsComponent = gpsEntityPlaces[i].components['gps-entity-place'];
        gpsComponent._cameraGps = KalmanGpsCamera.components['fixed-point-kalman-gps-camera'];
      }
        window.dispatchEvent(new CustomEvent('gps-camera-origin-coord-set'));
      }
      if (this.loader && this.loader.parentElement) {
        document.body.removeChild(this.loader)
      }
    }.bind(this));

    this.lookControls = this.el.components['look-controls'];

    // listen to deviceorientation event
    var eventName = this._getDeviceOrientationEventName();
    this._onDeviceOrientation = this._onDeviceOrientation.bind(this);

    // if Safari
    if (!!navigator.userAgent.match(/Version\/[\d.]+.*Safari/)) {
      // iOS 13+
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        var handler = function () {
          //console.log('Requesting device orientation permissions...')
          DeviceOrientationEvent.requestPermission();
          document.removeEventListener('touchend', handler);
        };

        document.addEventListener('touchend', function () { handler() }, false);

        alert('After camera permission prompt, please tap the screen to activate geolocation.');
      } else {
        var timeout = setTimeout(function () {
          alert('Please enable device orientation in Settings > Safari > Motion & Orientation Access.')
        }, 750);
        window.addEventListener(eventName, function () {
          clearTimeout(timeout);
        });
      }
    } 

    window.addEventListener(eventName, this._onDeviceOrientation, false);

    this._watchPositionId = this._initWatchGPS(function (position) {
      if (this.data.simulateLatitude !== 0 && this.data.simulateLongitude !== 0) {
        localPosition = Object.assign({}, position.coords);
        localPosition.longitude = this.data.simulateLongitude;
        localPosition.latitude = this.data.simulateLatitude;
        localPosition.altitude = this.data.simulateAltitude;
        this.currentCoords = localPosition;
      }
      else {
        //console.log(position);
        this.globalCurrentPosition = position;
        this._updatePoiArray(SetCoords, position, this.Radius);
      }
      this._updatePosition();
    }.bind(this));
  },

  tick: function () {
    if (this.heading === null) {
      return;
    }
    this._updateRotation();
  },

  remove: function () {
    if (this._watchPositionId) {
      navigator.geolocation.clearWatch(this._watchPositionId);
    }
    this._watchPositionId = null;

    var eventName = this._getDeviceOrientationEventName();
    window.removeEventListener(eventName, this._onDeviceOrientation, false);
  },

  /**
   * Get device orientation event name, depends on browser implementation.
   * @returns {string} event name
   */
  _getDeviceOrientationEventName: function () {
    if ('ondeviceorientationabsolute' in window) {
      var eventName = 'deviceorientationabsolute'
    } else if ('ondeviceorientation' in window) {
      var eventName = 'deviceorientation'
    } else {
      var eventName = ''
      //console.error('Compass not supported')
    }

    return eventName
  },

  /**
   * Get current user position.
   *
   * @param {function} onSuccess
   * @param {function} onError
   * @returns {Promise}
   */
  _initWatchGPS: function (onSuccess, onError) {
    if (!onError) {
      onError = function (err) {
        //console.warn('ERROR(' + err.code + '): ' + err.message)

        if (err.code === 1) {
          // User denied GeoLocation, let their know that
          alert('Please activate Geolocation and refresh the page. If it is already active, please check permissions for this website.');
          return;
        }

        if (err.code === 3) {
          alert('Cannot retrieve GPS position. Signal is absent.');
          return;
        }
      };
    }

    if ('geolocation' in navigator === false) {
      onError({ code: 0, message: 'Geolocation is not supported by your browser' });
      return Promise.resolve();
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition
    return navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 27000,
    });
  },

  /**
   * Update user position.
   *
   * @returns {void}
   */
  _updatePosition: function () {
    // don't update if accuracy is not good enough
    if (this.currentCoords.accuracy > this.data.positionMinAccuracy) {
      if (this.data.alert && !document.getElementById('alert-popup')) {
        var popup = document.createElement('div');
        popup.innerHTML = 'GPS signal is very poor. Try move outdoor or to an area with a better signal.'
        popup.setAttribute('id', 'alert-popup');
        document.body.appendChild(popup);
      }
      return;
    }

    var alertPopup = document.getElementById('alert-popup');
    if (this.currentCoords.accuracy <= this.data.positionMinAccuracy && alertPopup) {
      document.body.removeChild(alertPopup);
    }

    if (!this.originCoords) {
      // first camera initialization
      this.originCoords = this.currentCoords;
      this._setPosition();

      var loader = document.querySelector('.arjs-loader');
      if (loader) {
        loader.remove();
      }
      window.dispatchEvent(new CustomEvent('gps-camera-origin-coord-set'));
    } else {
      this._setPosition();
    }
  },
  _setPosition: function () {
    var position = this.el.getAttribute('position');

    // *** KALMAN FILTER
    if (!this.kalmanx || !this.kalmanz) {
      let sysA = 1;
      let sysB = this.data.B;
      let kalmanR = this.data.R;
      let kalmanQ = this.data.Q;
      if (!this.kalmanx) {
        this.kalmanx = new KalmanFilter({R: kalmanR, Q: kalmanQ, A: sysA, B: sysB});
      }
      if (!this.kalmanz) {
        this.kalmanz = new KalmanFilter({R: kalmanR, Q: kalmanQ, A: sysA, B: sysB});
      }
    }

    // * 1) MÅLING: Position har måling på x og z i gpsPos.x gpsPos.z
    var gpsPos = {};
    Object.assign(gpsPos, position);

    // compute gpsPos.x
    var dstCoords = {
      longitude: this.currentCoords.longitude,
      latitude: this.originCoords.latitude,
      altitude: this.currentCoords.altitude,
    };

    gpsPos.x = this.computeDistanceMeters(this.originCoords, dstCoords);
    gpsPos.x *= this.currentCoords.longitude > this.originCoords.longitude ? 1 : -1;

    // compute gpsPos.z
    var dstCoords = {
      longitude: this.originCoords.longitude,
      latitude: this.currentCoords.latitude,
    }

    gpsPos.z = this.computeDistanceMeters(this.originCoords, dstCoords);
    gpsPos.z *= this.currentCoords.latitude > this.originCoords.latitude ? -1 : 1;

    // * 2) Modellere position x og z
    let dt = 0.001 * (this.gpsTimestampArray[1] - this.gpsTimestampArray[0]);
    let v = this.gpsVelocity;
    let u = {};

    // xM er den modellerte x posisjonen
    u.x = dt*Math.sin(this.heading)*v;
    if (u.x === NaN || u.x === undefined || u.x === null) {
      u.x = position.x;
    }

    // zM er den modellerte x posisjonen
    u.z = dt*Math.cos(this.heading)*(-v);
    if (u.z === NaN || u.z === undefined || u.z === null) {
      u.z = position.z;
    }

    // 3) Sett måling og modell inn i kalman, og få ut x og z
    if (this.data.logConsole == true) {
      //console.log("---");
      //console.log("kalman x (in scene): " + this.kalmanx.filter(gpsPos.x, u.x));
      //console.log("kalman z (in scene): " + this.kalmanz.filter(gpsPos.z, u.z));
    }

    position.x = this.kalmanx.filter(gpsPos.x, u.x);
    position.z = this.kalmanz.filter(gpsPos.z, u.z);
    if (this.poi_distance < this.Radius) {
      position.y = this.currentCoords.altitude;
    } else {
      position.y = 0;
    }

    console.log(this.poi_distance);
    console.log(position);

    // update position
    this.el.setAttribute('position', position);

    // ***

    window.dispatchEvent(new CustomEvent('gps-camera-update-position', { detail: { position: this.currentCoords, origin: this.originCoords } }));
  },
  /**
   * Returns distance in meters between source and destination inputs.
   *
   *  Calculate distance, bearing and more between Latitude/Longitude points
   *  Details: https://www.movable-type.co.uk/scripts/latlong.html
   *
   * @param {Position} src
   * @param {Position} dest
   * @param {Boolean} isPlace
   *
   * @returns {number} distance | Number.MAX_SAFE_INTEGER
   */
  computeDistanceMeters: function (src, dest, isPlace) {
    var dlongitude = THREE.Math.degToRad(dest.longitude - src.longitude);
    var dlatitude = THREE.Math.degToRad(dest.latitude - src.latitude);

    var a = (Math.sin(dlatitude / 2) * Math.sin(dlatitude / 2)) + Math.cos(THREE.Math.degToRad(src.latitude)) * Math.cos(THREE.Math.degToRad(dest.latitude)) * (Math.sin(dlongitude / 2) * Math.sin(dlongitude / 2));
    var angle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var distance = angle * 6378160;

    // if function has been called for a place, and if it's too near and a min distance has been set,
    // return max distance possible - to be handled by the caller
    if (isPlace && this.data.minDistance && this.data.minDistance > 0 && distance < this.data.minDistance) {
      return Number.MAX_SAFE_INTEGER;
    }

    // if function has been called for a place, and if it's too far and a max distance has been set,
    // return max distance possible - to be handled by the caller
    if (isPlace && this.data.maxDistance && this.data.maxDistance > 0 && distance > this.data.maxDistance) {
      return Number.MAX_SAFE_INTEGER;
    }

    return distance;
  },

  /**
   * Compute compass heading.
   *
   * @param {number} alpha
   * @param {number} beta
   * @param {number} gamma
   *
   * @returns {number} compass heading
   */
  _computeCompassHeading: function (alpha, beta, gamma) {

    // Convert degrees to radians
    var alphaRad = alpha * (Math.PI / 180);
    var betaRad = beta * (Math.PI / 180);
    var gammaRad = gamma * (Math.PI / 180);

    // Calculate equation components
    var cA = Math.cos(alphaRad);
    var sA = Math.sin(alphaRad);
    var sB = Math.sin(betaRad);
    var cG = Math.cos(gammaRad);
    var sG = Math.sin(gammaRad);

    // Calculate A, B, C rotation components
    var rA = - cA * sG - sA * sB * cG;
    var rB = - sA * sG + cA * sB * cG;

    // Calculate compass heading
    var compassHeading = Math.atan(rA / rB);

    // Convert from half unit circle to whole unit circle
    if (rB < 0) {
      compassHeading += Math.PI;
    } else if (rA < 0) {
      compassHeading += 2 * Math.PI;
    }

    // Convert radians to degrees
    compassHeading *= 180 / Math.PI;

    return compassHeading;
  },

  /**
   * Handler for device orientation event.
   *
   * @param {Event} event
   * @returns {void}
   */
  _onDeviceOrientation: function (event) {
    if (event.webkitCompassHeading !== undefined) {
      //console.log(event.webkitCompassHeading);
      //console.log(event.webkitCompassAccuracy);
      if (event.webkitCompassAccuracy < 50) {
        this.heading = event.webkitCompassHeading;
      } else {
        console.warn('webkitCompassAccuracy is event.webkitCompassAccuracy');
      }
    } else if (event.alpha !== null) {
      if (event.absolute === true || event.absolute === undefined) {
        this.heading = this._computeCompassHeading(event.alpha, event.beta, event.gamma);
      } else {
        //console.warn('event.absolute === false');
      }
    } else {
      //console.warn('event.alpha === null');
    }
  },

  /**
   * Update user rotation data.
   *
   * @returns {void}
   */
  _updateRotation: function () {
    var heading = 360 - this.heading;
    var cameraRotation = this.el.getAttribute('rotation').y;
    var yawRotation = THREE.Math.radToDeg(this.lookControls.yawObject.rotation.y);
    var offset = (heading - (cameraRotation - yawRotation)) % 360;
    this.lookControls.yawObject.rotation.y = THREE.Math.degToRad(offset);
  },

  _distanceBetweenTwoGpsPoints: function (lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    var φ1 = lat1 * Math.PI/180; // φ, λ in radians
    var φ2 = lat2 * Math.PI/180;
    var Δφ = (lat2-lat1) * Math.PI/180;
    var Δλ = (lon2-lon1) * Math.PI/180;
  
    var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
    var d = R * c; // in metres
  
    return d;
  },

  _updatePoiArray: function (SetCoords, position, Radius){
    // *** MODIFICATION
    console.log('Det er her det skjer.');
    //var _position = Object.create(position.coords);

    //console.log(position.coords);
    //console.log(_position);

    //console.log(SetCoords);

    this.currentCoords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: 0
      }
    this.gpsVelocity = position.coords.speed;

    var poi_array = new Array();
    poi_array[0] = [SetCoords[0], SetCoords[1], 0];

    var i;
    var a = [1, 1, -1, -1];
    var b = [1, -1, 1, -1];
    var proximity = 0.00005;
    var distances = new Array();
    var closest_poi = [poi_array[0][0], poi_array[0][1], 0];
    var closest_index = 0;
    var closest_distance = this._distanceBetweenTwoGpsPoints(poi_array[0][0], poi_array[0][1], this.currentCoords.latitude, this.currentCoords.longitude);
    var temp_distance = 0;
    
    distances[0] = closest_distance;
    
    for (i = 0; i < 5; i++) {
      if (i == 4) {
        poi_array[i+1] = [poi_array[0][0] + 0.000012*8, poi_array[0][1] + 0.000248*8, 30];
      } else {
        poi_array[i+1] = [poi_array[0][0] + a[i]*proximity, poi_array[0][1] + b[i]*proximity, 0];
      }
      temp_distance = this._distanceBetweenTwoGpsPoints(poi_array[i+1][0], poi_array[i+1][1], this.currentCoords.latitude, this.currentCoords.longitude);
      distances[i+1] = temp_distance;
      if (temp_distance < closest_distance) {
        closest_poi = poi_array[i+1];
        closest_index = i+1;
        closest_distance = temp_distance;
      }
    }

    this.poi_distance = distances[5];

    
    /*
    console.log(poi_array);
    console.log(closest_distance);
    console.log(closest_index);
    console.log(distances);
    console.log(this.currentCoords);
    */
    

    if (this.poi_distance < this.Radius) {
      this.currentCoords.latitude = poi_array[5][0];
      this.currentCoords.longitude = poi_array[5][1];
      this.currentCoords.altitude = poi_array[5][2];
    } else {
      this.currentCoords = position.coords;
    }

    console.log(this.currentCoords);

    //console.log(this.currentCoords);

    if (this.gpsTimestampArray.length < 2) {
      this.gpsTimestampArray.push(position.timestamp);
    } else {
      this.gpsTimestampArray[0] = this.gpsTimestampArray[1];
      this.gpsTimestampArray[1] = position.timestamp;
    }
    // ***
  },
});