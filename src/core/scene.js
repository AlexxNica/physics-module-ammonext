import {
  Scene as SceneNative,
  Mesh,
  SphereGeometry,
  MeshNormalMaterial,
  BoxGeometry,
  Vector3
} from 'three';

import {Loop} from 'whs';

import {Vehicle} from '../vehicle/vehicle';
import {Eventable} from '../eventable';

import {
  addObjectChildren,
  MESSAGE_TYPES,
  temp1Vector3,
  temp1Matrix4,
  REPORT_ITEMSIZE,
  COLLISIONREPORT_ITEMSIZE,
  VEHICLEREPORT_ITEMSIZE,
  CONSTRAINTREPORT_ITEMSIZE
} from '../api';

export class WorldModule extends Eventable {
  constructor(params) {
    super();

    this.params = Object.assign({
      fixedTimeStep: 1/60,
      rateLimit: true,
      ammo: "",
      softbody: false,
      gravity: new Vector3(0, -100, 0)
    }, params);

    this._worker = new (require('worker-loader?inline!../worker.js'))();
    this._worker.transferableMessage = this._worker.webkitPostMessage || this._worker.postMessage;

    this.execute('init', this.params);

    this._materials_ref_counts = {};
    this._objects = {};
    this._vehicles = {};
    this._constraints = {};
    this._is_simulating = false;
    this.getObjectId = (() => {
      let _id = 1;
      return () => {
        return _id++;
      };
    })();

    const ab = new ArrayBuffer(1);
    this._worker.transferableMessage(ab, [ab]);
    this.SUPPORT_TRANSFERABLE = (ab.byteLength === 0);

    this._worker.onmessage = (event) => {
      let _temp,
        data = event.data;

      if (data instanceof ArrayBuffer && data.byteLength !== 1)// byteLength === 1 is the worker making a SUPPORT_TRANSFERABLE test
        data = new Float32Array(data);

      if (data instanceof Float32Array) {
        // transferable object
        switch (data[0]) {
          case MESSAGE_TYPES.WORLDREPORT:
            this._updateScene(data);
            break;

          case MESSAGE_TYPES.SOFTREPORT:
            this._updateSoftbodies(data);
            break;

          case MESSAGE_TYPES.COLLISIONREPORT:
            this._updateCollisions(data);
            break;

          case MESSAGE_TYPES.VEHICLEREPORT:
            this._updateVehicles(data);
            break;

          case MESSAGE_TYPES.CONSTRAINTREPORT:
            this._updateConstraints(data);
            break;
          default:
        }
      } else if (data.cmd) {
        // non-transferable object
        switch (data.cmd) {
          case 'objectReady':
            _temp = data.params;
            if (this._objects[_temp]) this._objects[_temp].dispatchEvent('ready');
            break;

          case 'worldReady':
            this.dispatchEvent('ready');
            break;

          case 'vehicle':
            window.test = data;
            break;

          default:
            // Do nothing, just show the message
            console.debug(`Received: ${data.cmd}`);
            console.dir(data.params);
            break;
        }
      } else {
        switch (data[0]) {
          case MESSAGE_TYPES.WORLDREPORT:
            this._updateScene(data);
            break;

          case MESSAGE_TYPES.COLLISIONREPORT:
            this._updateCollisions(data);
            break;

          case MESSAGE_TYPES.VEHICLEREPORT:
            this._updateVehicles(data);
            break;

          case MESSAGE_TYPES.CONSTRAINTREPORT:
            this._updateConstraints(data);
            break;
          default:
        }
      }
    };
  }

  _updateScene(data) {
    let index = data[1];

    while (index--) {
      const offset = 2 + index * REPORT_ITEMSIZE;
      const object = this._objects[data[offset]];
      const component = object.component;
      const _physijs = component._physijs;

      if (object === null) continue;

      if (component.__dirtyPosition === false) {
        object.position.set(
          data[offset + 1],
          data[offset + 2],
          data[offset + 3]
        );

        component.__dirtyPosition = false;
      }

      if (component.__dirtyRotation === false) {
        object.quaternion.set(
          data[offset + 4],
          data[offset + 5],
          data[offset + 6],
          data[offset + 7]
        );

        component.__dirtyRotation = false;
      }

      _physijs.linearVelocity.set(
        data[offset + 8],
        data[offset + 9],
        data[offset + 10]
      );

      _physijs.angularVelocity.set(
        data[offset + 11],
        data[offset + 12],
        data[offset + 13]
      );
    }

    if (this.SUPPORT_TRANSFERABLE)
      this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker

    this._is_simulating = false;
    this.dispatchEvent('update');
  }

  _updateSoftbodies(data) {

    let index = data[1],
      offset = 2;

    while (index--) {
      const size = data[offset + 1];
      const object = this._objects[data[offset]];
      const _physijs = object.component._physijs;

      if (object === null) continue;

      const attributes = object.geometry.attributes;
      const volumePositions = attributes.position.array;

      const offsetVert = offset + 2;

      if (_physijs.type === "softTrimesh") {
        const volumeNormals = attributes.normal.array;

        for (let i = 0; i < size; i++) {
          const offs = offsetVert + i * 18;

          const x1 = data[offs];
          const y1 = data[offs + 1];
          const z1 = data[offs + 2];

          const nx1 = data[offs + 3];
          const ny1 = data[offs + 4];
          const nz1 = data[offs + 5];

          const x2 = data[offs + 6];
          const y2 = data[offs + 7];
          const z2 = data[offs + 8];

          const nx2 = data[offs + 9];
          const ny2 = data[offs + 10];
          const nz2 = data[offs + 11];

          const x3 = data[offs + 12];
          const y3 = data[offs + 13];
          const z3 = data[offs + 14];

          const nx3 = data[offs + 15];
          const ny3 = data[offs + 16];
          const nz3 = data[offs + 17];

          const i9 = i * 9;

          volumePositions[i9] = x1;
          volumePositions[i9 + 1] = y1;
          volumePositions[i9 + 2] = z1;

          volumePositions[i9 + 3] = x2;
          volumePositions[i9 + 4] = y2;
          volumePositions[i9 + 5] = z2;

          volumePositions[i9 + 6] = x3;
          volumePositions[i9 + 7] = y3;
          volumePositions[i9 + 8] = z3;

          volumeNormals[i9] = nx1;
          volumeNormals[i9 + 1] = ny1;
          volumeNormals[i9 + 2] = nz1;

          volumeNormals[i9 + 3] = nx2;
          volumeNormals[i9 + 4] = ny2;
          volumeNormals[i9 + 5] = nz2;

          volumeNormals[i9 + 6] = nx3;
          volumeNormals[i9 + 7] = ny3;
          volumeNormals[i9 + 8] = nz3;
        }

        attributes.normal.needsUpdate = true;
      }
      else if (_physijs.type === "softRopeMesh") {
        for (let i = 0; i < size; i++) {
          const offs = offsetVert + i * 3;

          const x = data[offs];
          const y = data[offs + 1];
          const z = data[offs + 2];

          volumePositions[i * 3] = x;
          volumePositions[i * 3 + 1] = y;
          volumePositions[i * 3 + 2] = z;
        }
      } else {
        const volumeNormals = attributes.normal.array;

        for (let i = 0; i < size; i++) {
          const offs = offsetVert + i * 6;

          const x = data[offs];
          const y = data[offs + 1];
          const z = data[offs + 2];

          const nx = data[offs + 3];
          const ny = data[offs + 4];
          const nz = data[offs + 5];

          volumePositions[i * 3] = x;
          volumePositions[i * 3 + 1] = y;
          volumePositions[i * 3 + 2] = z;

          volumeNormals[i * 3] = nx;
          volumeNormals[i * 3 + 1] = ny;
          volumeNormals[i * 3 + 2] = nz;
        }

        attributes.normal.needsUpdate = true;
      }

      attributes.position.needsUpdate = true;

      offset += 2 + size * 18;
    }

    // if (this.SUPPORT_TRANSFERABLE)
    //   this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker

    this._is_simulating = false;
  }

  _updateVehicles(data) {
    let vehicle, wheel;

    for (let i = 0; i < (data.length - 1) / VEHICLEREPORT_ITEMSIZE; i++) {
      const offset = 1 + i * VEHICLEREPORT_ITEMSIZE;
      vehicle = this._vehicles[data[offset]];

      if (vehicle === null) continue;

      wheel = vehicle.wheels[data[offset + 1]];

      wheel.position.set(
        data[offset + 2],
        data[offset + 3],
        data[offset + 4]
      );

      wheel.quaternion.set(
        data[offset + 5],
        data[offset + 6],
        data[offset + 7],
        data[offset + 8]
      );
    }

    if (this.SUPPORT_TRANSFERABLE)
      this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
  }

  _updateConstraints(data) {
    let constraint, object;

    for (let i = 0; i < (data.length - 1) / CONSTRAINTREPORT_ITEMSIZE; i++) {
      const offset = 1 + i * CONSTRAINTREPORT_ITEMSIZE;
      constraint = this._constraints[data[offset]];
      object = this._objects[data[offset + 1]];

      if (constraint === undefined || object === undefined) continue;

      temp1Vector3.set(
        data[offset + 2],
        data[offset + 3],
        data[offset + 4]
      );

      temp1Matrix4.extractRotation(object.matrix);
      temp1Vector3.applyMatrix4(temp1Matrix4);

      constraint.positiona.addVectors(object.position, temp1Vector3);
      constraint.appliedImpulse = data[offset + 5];
    }

    if (this.SUPPORT_TRANSFERABLE)
      this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
  }

  _updateCollisions(data) {
    /**
     * #TODO
     * This is probably the worst way ever to handle collisions. The inherent evilness is a residual
     * effect from the previous version's evilness which mutated when switching to transferable objects.
     *
     * If you feel inclined to make this better, please do so.
     */

    const collisions = {},
      normal_offsets = {};

    // Build collision manifest
    for (let i = 0; i < data[1]; i++) {
      const offset = 2 + i * COLLISIONREPORT_ITEMSIZE;
      const object = data[offset];
      const object2 = data[offset + 1];

      normal_offsets[`${object}-${object2}`] = offset + 2;
      normal_offsets[`${object2}-${object}`] = -1 * (offset + 2);

      // Register collisions for both the object colliding and the object being collided with
      if (!collisions[object]) collisions[object] = [];
      collisions[object].push(object2);

      if (!collisions[object2]) collisions[object2] = [];
      collisions[object2].push(object);
    }

    // Deal with collisions
    for (const id1 in this._objects) {
      if (!this._objects.hasOwnProperty(id1)) continue;
      const object = this._objects[id1];
      const component = object.component;
      const _physijs = component._physijs;
      if (object === null) continue;

      // If object touches anything, ...
      if (collisions[id1]) {
        // Clean up touches array
        for (let j = 0; j < _physijs.touches.length; j++) {
          if (collisions[id1].indexOf(_physijs.touches[j]) === -1)
            _physijs.touches.splice(j--, 1);
        }

        // Handle each colliding object
        for (let j = 0; j < collisions[id1].length; j++) {
          const id2 = collisions[id1][j];
          const object2 = this._objects[id2];
          const component2 = object2.component;
          const _physijs2 = component2._physijs;

          if (object2) {
            // If object was not already touching object2, notify object
            if (_physijs.touches.indexOf(id2) === -1) {
              _physijs.touches.push(id2);

              temp1Vector3.subVectors(component.getLinearVelocity(), component2.getLinearVelocity());
              const temp1 = temp1Vector3.clone();

              temp1Vector3.subVectors(component.getAngularVelocity(), component2.getAngularVelocity());
              const temp2 = temp1Vector3.clone();

              let normal_offset = normal_offsets[`${_physijs.id}-${_physijs2.id}`];

              if (normal_offset > 0) {
                temp1Vector3.set(
                  -data[normal_offset],
                  -data[normal_offset + 1],
                  -data[normal_offset + 2]
                );
              } else {
                normal_offset *= -1;

                temp1Vector3.set(
                  data[normal_offset],
                  data[normal_offset + 1],
                  data[normal_offset + 2]
                );
              }

              object.dispatchEvent('collision', object2, temp1, temp2, temp1Vector3);
            }
          }
        }
      } else _physijs.touches.length = 0; // not touching other objects
    }

    this.collisions = collisions;

    if (this.SUPPORT_TRANSFERABLE)
      this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
  }

  addConstraint(constraint, show_marker) {
    constraint.id = this.getObjectId();
    this._constraints[constraint.id] = constraint;
    this.execute('addConstraint', constraint.getDefinition());

    if (show_marker) {
      let marker;

      switch (constraint.type) {
        case 'point':
          marker = new Mesh(
            new SphereGeometry(1.5),
            new MeshNormalMaterial()
          );

          marker.position.copy(constraint.positiona);
          this._objects[constraint.objecta].add(marker);
          break;

        case 'hinge':
          marker = new Mesh(
            new SphereGeometry(1.5),
            new MeshNormalMaterial()
          );

          marker.position.copy(constraint.positiona);
          this._objects[constraint.objecta].add(marker);
          break;

        case 'slider':
          marker = new Mesh(
            new BoxGeometry(10, 1, 1),
            new MeshNormalMaterial()
          );

          marker.position.copy(constraint.positiona);

          // This rotation isn't right if all three axis are non-0 values
          // TODO: change marker's rotation order to ZYX
          marker.rotation.set(
            constraint.axis.y, // yes, y and
            constraint.axis.x, // x axis are swapped
            constraint.axis.z
          );
          this._objects[constraint.objecta].add(marker);
          break;

        case 'conetwist':
          marker = new Mesh(
            new SphereGeometry(1.5),
            new MeshNormalMaterial()
          );

          marker.position.copy(constraint.positiona);
          this._objects[constraint.objecta].add(marker);
          break;

        case 'dof':
          marker = new Mesh(
            new SphereGeometry(1.5),
            new MeshNormalMaterial()
          );

          marker.position.copy(constraint.positiona);
          this._objects[constraint.objecta].add(marker);
          break;
        default:
      }
    }

    return constraint;
  }

  onSimulationResume() {
    this.execute('onSimulationResume', {});
  }

  removeConstraint(constraint) {
    if (this._constraints[constraint.id] !== undefined) {
      this.execute('removeConstraint', {id: constraint.id});
      delete this._constraints[constraint.id];
    }
  }

  execute(cmd, params) {
    this._worker.postMessage({cmd, params});
  }

  bridge = {
    onAdd(component, self) {
      const object = component.native;
      // this.add(object);
      const _physijs = object._physijs || object.component._physijs;
      
      if (_physijs) {
        component.worldModule = self;
        _physijs.id = self.getObjectId();

        if (object instanceof Vehicle) {
          this.add(object.mesh);
          self._vehicles[_physijs.id] = object;
          self.execute('addVehicle', _physijs);
        } else {
          component.__dirtyPosition = false;
          component.__dirtyRotation = false;
          self._objects[_physijs.id] = object;

          if (object.children.length) {
            _physijs.children = [];
            addObjectChildren(object, object);
          }

          if (object.material._physijs) {
            if (self._materials_ref_counts.hasOwnProperty(object.material._physijs.id))
              self._materials_ref_counts[object.material._physijs.id]++;
            else {
              self.execute('registerMaterial', object.material._physijs);
              _physijs.materialId = object.material._physijs.id;
              self._materials_ref_counts[object.material._physijs.id] = 1;
            }
          }

          // Object starting position + rotation
          _physijs.position = {
            x: object.position.x,
            y: object.position.y,
            z: object.position.z
          };

          _physijs.rotation = {
            x: object.quaternion.x,
            y: object.quaternion.y,
            z: object.quaternion.z,
            w: object.quaternion.w
          };

          if (_physijs.isSoftbody) {
            object.position.set(0, 0, 0);
            object.quaternion.set(0, 0, 0, 1);
          }

          // Check for scaling
          // var mass_scaling = new Vector3(1, 1, 1);

          if (_physijs.width) _physijs.width *= object.scale.x;
          if (_physijs.height) _physijs.height *= object.scale.y;
          if (_physijs.depth) _physijs.depth *= object.scale.z;

          self.execute('addObject', _physijs);
        }
      }
    },
    onRemove(component, shared) {
      const object = component.native;

      if (object instanceof Vehicle) {
        shared.execute('removeVehicle', {id: object._physijs.id});
        while (object.wheels.length) this.remove(object.wheels.pop());

        this.remove(object.mesh);
        shared._vehicles[object._physijs.id] = null;
      } else {
        // Mesh.prototype.remove.call(this, object);

        if (object._physijs) {
          shared._objects[object._physijs.id] = null;
          shared.execute('removeObject', {id: object._physijs.id});
        }
      }
      if (object.material && object.material._physijs && shared._materials_ref_counts.hasOwnProperty(object.material._physijs.id)) {
        shared._materials_ref_counts[object.material._physijs.id]--;

        if (shared._materials_ref_counts[object.material._physijs.id] === 0) {
          shared.execute('unRegisterMaterial', object.material._physijs);
          shared._materials_ref_counts[object.material._physijs.id] = null;
        }
      }
    }
  };

  integrate(params, shared) {
    // ...

    this.setFixedTimeStep = function(fixedTimeStep) {
      if (fixedTimeStep) shared.execute('setFixedTimeStep', fixedTimeStep);
    }

    this.setGravity = function(gravity) {
      if (gravity) shared.execute('setGravity', gravity);
    }

    this.simulate = function(timeStep, maxSubSteps) {
      if (shared._stats) shared._stats.begin();

      if (shared._is_simulating) return false;

      shared._is_simulating = true;

      for (const object_id in shared._objects) {
        if (!shared._objects.hasOwnProperty(object_id)) continue;

        const object = shared._objects[object_id];
        const component = object.component;
        const _physijs = component._physijs;

        if (object !== null && (component.__dirtyPosition || component.__dirtyRotation)) {
          const update = {id: _physijs.id};

          if (component.__dirtyPosition) {
            update.pos = {
              x: object.position.x,
              y: object.position.y,
              z: object.position.z
            };

            if (_physijs.isSoftbody) object.position.set(0, 0, 0);

            component.__dirtyPosition = false;
          }

          if (component.__dirtyRotation) {
            update.quat = {
              x: object.quaternion.x,
              y: object.quaternion.y,
              z: object.quaternion.z,
              w: object.quaternion.w
            };

            if (_physijs.isSoftbody) object.rotation.set(0, 0, 0);

            component.__dirtyRotation = false;
          }

          shared.execute('updateTransform', update);
        }
      }

      shared.execute('simulate', {timeStep, maxSubSteps});

      if (shared._stats) shared._stats.end();
      return true;
    }

    // const simulateProcess = (t) => {
    //   window.requestAnimationFrame(simulateProcess);

    //   this.simulate(1/60, 1); // delta, 1
    // }

    // simulateProcess();

    new WHS.Loop((clock) => {
      this.simulate(clock.getDelta(), 1); // delta, 1
    }).start(this);

    this.setGravity(params.gravity);
  }
}

// export class Scene extends SceneNative {
//   constructor(params = {}, init = {}) {
//     super();

//     this._worker = new (require('worker-loader?inline!../worker.js'))();
//     this._worker.transferableMessage = this._worker.webkitPostMessage || this._worker.postMessage;

//     params.fixedTimeStep = params.fixedTimeStep || 1 / 60;
//     params.rateLimit = params.rateLimit || true;
//     params.ammo = params.ammo || "";

//     params.whs = {
//       softbody: init.softbody
//     };

//     console.log('preyes');
//     this.execute('init', params);

//     this._materials_ref_counts = {};
//     this._objects = {};
//     this._vehicles = {};
//     this._constraints = {};
//     this._is_simulating = false;
//     this.getObjectId = (() => {
//       let _id = 1;
//       return () => {
//         return _id++;
//       };
//     })();

//     const ab = new ArrayBuffer(1);
//     this._worker.transferableMessage(ab, [ab]);
//     this.SUPPORT_TRANSFERABLE = (ab.byteLength === 0);

//     this._worker.onmessage = (event) => {
//       let _temp,
//         data = event.data;

//       if (data instanceof ArrayBuffer && data.byteLength !== 1)// byteLength === 1 is the worker making a SUPPORT_TRANSFERABLE test
//         data = new Float32Array(data);

//       if (data instanceof Float32Array) {
//         // transferable object
//         switch (data[0]) {
//           case MESSAGE_TYPES.WORLDREPORT:
//             this._updateScene(data);
//             break;

//           case MESSAGE_TYPES.SOFTREPORT:
//             this._updateSoftbodies(data);
//             break;

//           case MESSAGE_TYPES.COLLISIONREPORT:
//             this._updateCollisions(data);
//             break;

//           case MESSAGE_TYPES.VEHICLEREPORT:
//             this._updateVehicles(data);
//             break;

//           case MESSAGE_TYPES.CONSTRAINTREPORT:
//             this._updateConstraints(data);
//             break;
//           default:
//         }
//       } else if (data.cmd) {
//         // non-transferable object
//         switch (data.cmd) {
//           case 'objectReady':
//             _temp = data.params;
//             if (this._objects[_temp]) this._objects[_temp].dispatchEvent('ready');
//             break;

//           case 'worldReady':
//             this.dispatchEvent('ready');
//             break;

//           case 'vehicle':
//             window.test = data;
//             break;

//           default:
//             // Do nothing, just show the message
//             console.debug(`Received: ${data.cmd}`);
//             console.dir(data.params);
//             break;
//         }
//       } else {
//         switch (data[0]) {
//           case MESSAGE_TYPES.WORLDREPORT:
//             this._updateScene(data);
//             break;

//           case MESSAGE_TYPES.COLLISIONREPORT:
//             this._updateCollisions(data);
//             break;

//           case MESSAGE_TYPES.VEHICLEREPORT:
//             this._updateVehicles(data);
//             break;

//           case MESSAGE_TYPES.CONSTRAINTREPORT:
//             this._updateConstraints(data);
//             break;
//           default:
//         }
//       }
//     };

//     Object.assign(this, new Eventable());
//     Eventable.make(Scene);

//     // this._stats = init.stats ? new Stats() : false;
//     this._world = init.world || false;

//     // if (this._stats) {
//     //   this._stats.setMode(0);
//     //   this._stats.domElement.style.position = 'absolute';
//     //   this._stats.domElement.style.left = '0px';
//     //   this._stats.domElement.style.top = '48px';

//     //   this._world.$element.appendChild(this._stats.domElement);
//     // }
//   }

//   _updateScene(data) {
//     let index = data[1];

//     while (index--) {
//       const offset = 2 + index * REPORT_ITEMSIZE;
//       const object = this._objects[data[offset]];

//       if (object === null) continue;

//       if (object.__dirtyPosition === false) {
//         object.position.set(
//           data[offset + 1],
//           data[offset + 2],
//           data[offset + 3]
//         );

//         object.__dirtyPosition = false;
//       }

//       if (object.__dirtyRotation === false) {
//         object.quaternion.set(
//           data[offset + 4],
//           data[offset + 5],
//           data[offset + 6],
//           data[offset + 7]
//         );

//         object.__dirtyRotation = false;
//       }

//       object._physijs.linearVelocity.set(
//         data[offset + 8],
//         data[offset + 9],
//         data[offset + 10]
//       );

//       object._physijs.angularVelocity.set(
//         data[offset + 11],
//         data[offset + 12],
//         data[offset + 13]
//       );
//     }

//     if (this.SUPPORT_TRANSFERABLE)
//       this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker

//     this._is_simulating = false;
//     this.dispatchEvent('update');
//   }

//   _updateSoftbodies(data) {
//     let index = data[1],
//       offset = 2;

//     while (index--) {
//       const size = data[offset + 1];
//       const object = this._objects[data[offset]];

//       if (object === null) continue;

//       const association = object._physijs.aIdxAssoc;
//       const attributes = object.geometry.attributes;

//       const volumePositions = attributes.position.array;

//       const offsetVert = offset + 2;

//       if (object._physijs.type === "softTrimesh") {
//         const volumeNormals = attributes.normal.array;

//         for (let i = 0; i < size; i++) {
//           const offs = offsetVert + i * 6;

//           const x = data[offs];
//           const y = data[offs + 1];
//           const z = data[offs + 2];

//           const nx = data[offs + 3];
//           const ny = data[offs + 4];
//           const nz = data[offs + 5];

//           const assocVertex = association[i];

//           for (let k = 0, kl = assocVertex.length; k < kl; k++) {
//             let indexVertex = assocVertex[k];

//             volumePositions[indexVertex] = x;
//             volumeNormals[indexVertex] = nx;
//             indexVertex++;

//             volumePositions[indexVertex] = y;
//             volumeNormals[indexVertex] = ny;
//             indexVertex++;

//             volumePositions[indexVertex] = z;
//             volumeNormals[indexVertex] = nz;
//           }
//         }

//         attributes.normal.needsUpdate = true;
//       }
//       else if (object._physijs.type === "softRopeMesh") {
//         for (let i = 0; i < size; i++) {
//           const offs = offsetVert + i * 3;

//           const x = data[offs];
//           const y = data[offs + 1];
//           const z = data[offs + 2];

//           volumePositions[i * 3] = x;
//           volumePositions[i * 3 + 1] = y;
//           volumePositions[i * 3 + 2] = z;
//         }
//       } else {
//         const volumeNormals = attributes.normal.array;

//         for (let i = 0; i < size; i++) {
//           const offs = offsetVert + i * 6;

//           const x = data[offs];
//           const y = data[offs + 1];
//           const z = data[offs + 2];

//           const nx = data[offs + 3];
//           const ny = data[offs + 4];
//           const nz = data[offs + 5];

//           volumePositions[i * 3] = x;
//           volumePositions[i * 3 + 1] = y;
//           volumePositions[i * 3 + 2] = z;

//           volumeNormals[i * 3] = nx;
//           volumeNormals[i * 3 + 1] = ny;
//           volumeNormals[i * 3 + 2] = nz;
//         }

//         attributes.normal.needsUpdate = true;
//       }

//       attributes.position.needsUpdate = true;

//       offset += 2 + size * 6;
//     }

//     // if (this.SUPPORT_TRANSFERABLE)
//     //   this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker

//     this._is_simulating = false;
//   }

//   _updateVehicles(data) {
//     let vehicle, wheel;

//     for (let i = 0; i < (data.length - 1) / VEHICLEREPORT_ITEMSIZE; i++) {
//       const offset = 1 + i * VEHICLEREPORT_ITEMSIZE;
//       vehicle = this._vehicles[data[offset]];

//       if (vehicle === null) continue;

//       wheel = vehicle.wheels[data[offset + 1]];

//       wheel.position.set(
//         data[offset + 2],
//         data[offset + 3],
//         data[offset + 4]
//       );

//       wheel.quaternion.set(
//         data[offset + 5],
//         data[offset + 6],
//         data[offset + 7],
//         data[offset + 8]
//       );
//     }

//     if (this.SUPPORT_TRANSFERABLE)
//       this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
//   }

//   _updateConstraints(data) {
//     let constraint, object;

//     for (let i = 0; i < (data.length - 1) / CONSTRAINTREPORT_ITEMSIZE; i++) {
//       const offset = 1 + i * CONSTRAINTREPORT_ITEMSIZE;
//       constraint = this._constraints[data[offset]];
//       object = this._objects[data[offset + 1]];

//       if (constraint === undefined || object === undefined) continue;

//       temp1Vector3.set(
//         data[offset + 2],
//         data[offset + 3],
//         data[offset + 4]
//       );

//       temp1Matrix4.extractRotation(object.matrix);
//       temp1Vector3.applyMatrix4(temp1Matrix4);

//       constraint.positiona.addVectors(object.position, temp1Vector3);
//       constraint.appliedImpulse = data[offset + 5];
//     }

//     if (this.SUPPORT_TRANSFERABLE)
//       this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
//   }

//   _updateCollisions(data) {
//     /**
//      * #TODO
//      * This is probably the worst way ever to handle collisions. The inherent evilness is a residual
//      * effect from the previous version's evilness which mutated when switching to transferable objects.
//      *
//      * If you feel inclined to make this better, please do so.
//      */

//     const collisions = {},
//       normal_offsets = {};

//     // Build collision manifest
//     for (let i = 0; i < data[1]; i++) {
//       const offset = 2 + i * COLLISIONREPORT_ITEMSIZE;
//       const object = data[offset];
//       const object2 = data[offset + 1];

//       normal_offsets[`${object}-${object2}`] = offset + 2;
//       normal_offsets[`${object2}-${object}`] = -1 * (offset + 2);

//       // Register collisions for both the object colliding and the object being collided with
//       if (!collisions[object]) collisions[object] = [];
//       collisions[object].push(object2);

//       if (!collisions[object2]) collisions[object2] = [];
//       collisions[object2].push(object);
//     }

//     // Deal with collisions
//     for (const id1 in this._objects) {
//       if (!this._objects.hasOwnProperty(id1)) continue;
//       const object = this._objects[id1];
//       if (object === null) continue;

//       // If object touches anything, ...
//       if (collisions[id1]) {
//         // Clean up touches array
//         for (let j = 0; j < object._physijs.touches.length; j++) {
//           if (collisions[id1].indexOf(object._physijs.touches[j]) === -1)
//             object._physijs.touches.splice(j--, 1);
//         }

//         // Handle each colliding object
//         for (let j = 0; j < collisions[id1].length; j++) {
//           const id2 = collisions[id1][j];
//           const object2 = this._objects[id2];

//           if (object2) {
//             // If object was not already touching object2, notify object
//             if (object._physijs.touches.indexOf(id2) === -1) {
//               object._physijs.touches.push(id2);

//               temp1Vector3.subVectors(object.getLinearVelocity(), object2.getLinearVelocity());
//               const temp1 = temp1Vector3.clone();

//               temp1Vector3.subVectors(object.getAngularVelocity(), object2.getAngularVelocity());
//               const temp2 = temp1Vector3.clone();

//               let normal_offset = normal_offsets[`${object._physijs.id}-${_physijs2.id}`];

//               if (normal_offset > 0) {
//                 temp1Vector3.set(
//                   -data[normal_offset],
//                   -data[normal_offset + 1],
//                   -data[normal_offset + 2]
//                 );
//               } else {
//                 normal_offset *= -1;

//                 temp1Vector3.set(
//                   data[normal_offset],
//                   data[normal_offset + 1],
//                   data[normal_offset + 2]
//                 );
//               }

//               object.dispatchEvent('collision', object2, temp1, temp2, temp1Vector3);
//             }
//           }
//         }
//       } else object._physijs.touches.length = 0; // not touching other objects
//     }

//     this.collisions = collisions;

//     if (this.SUPPORT_TRANSFERABLE)
//       this._worker.transferableMessage(data.buffer, [data.buffer]); // Give the typed array back to the worker
//   }

//   addConstraint(constraint, show_marker) {
//     constraint.id = this.getObjectId();
//     this._constraints[constraint.id] = constraint;
//     this.execute('addConstraint', constraint.getDefinition());

//     if (show_marker) {
//       let marker;

//       switch (constraint.type) {
//         case 'point':
//           marker = new Mesh(
//             new SphereGeometry(1.5),
//             new MeshNormalMaterial()
//           );

//           marker.position.copy(constraint.positiona);
//           this._objects[constraint.objecta].add(marker);
//           break;

//         case 'hinge':
//           marker = new Mesh(
//             new SphereGeometry(1.5),
//             new MeshNormalMaterial()
//           );

//           marker.position.copy(constraint.positiona);
//           this._objects[constraint.objecta].add(marker);
//           break;

//         case 'slider':
//           marker = new Mesh(
//             new BoxGeometry(10, 1, 1),
//             new MeshNormalMaterial()
//           );

//           marker.position.copy(constraint.positiona);

//           // This rotation isn't right if all three axis are non-0 values
//           // TODO: change marker's rotation order to ZYX
//           marker.rotation.set(
//             constraint.axis.y, // yes, y and
//             constraint.axis.x, // x axis are swapped
//             constraint.axis.z
//           );
//           this._objects[constraint.objecta].add(marker);
//           break;

//         case 'conetwist':
//           marker = new Mesh(
//             new SphereGeometry(1.5),
//             new MeshNormalMaterial()
//           );

//           marker.position.copy(constraint.positiona);
//           this._objects[constraint.objecta].add(marker);
//           break;

//         case 'dof':
//           marker = new Mesh(
//             new SphereGeometry(1.5),
//             new MeshNormalMaterial()
//           );

//           marker.position.copy(constraint.positiona);
//           this._objects[constraint.objecta].add(marker);
//           break;
//         default:
//       }
//     }

//     return constraint;
//   }

//   onSimulationResume() {
//     this.execute('onSimulationResume', {});
//   }

//   removeConstraint(constraint) {
//     if (this._constraints[constraint.id] !== undefined) {
//       this.execute('removeConstraint', {id: constraint.id});
//       delete this._constraints[constraint.id];
//     }
//   }

//   execute(cmd, params) {
//     this._worker.postMessage({cmd, params});
//   }

//   add(object) {
//     Mesh.prototype.add.call(this, object);

//     if (object._physijs) {
//       object.world = this;
//       object._physijs.id = this.getObjectId();

//       if (object instanceof Vehicle) {
//         this.add(object.mesh);
//         this._vehicles[object._physijs.id] = object;
//         this.execute('addVehicle', object._physijs);
//       } else {
//         object.__dirtyPosition = false;
//         object.__dirtyRotation = false;
//         this._objects[object._physijs.id] = object;

//         if (object.children.length) {
//           object._physijs.children = [];
//           addObjectChildren(object, object);
//         }

//         if (object.material._physijs) {
//           if (this._materials_ref_counts.hasOwnProperty(object.material._physijs.id))
//             this._materials_ref_counts[object.material._physijs.id]++;
//           else {
//             this.execute('registerMaterial', object.material._physijs);
//             object._physijs.materialId = object.material._physijs.id;
//             this._materials_ref_counts[object.material._physijs.id] = 1;
//           }
//         }

//         // Object starting position + rotation
//         object._physijs.position = {
//           x: object.position.x,
//           y: object.position.y,
//           z: object.position.z
//         };

//         object._physijs.rotation = {
//           x: object.quaternion.x,
//           y: object.quaternion.y,
//           z: object.quaternion.z,
//           w: object.quaternion.w
//         };

//         // Check for scaling
//         // var mass_scaling = new Vector3(1, 1, 1);

//         if (object._physijs.width) object._physijs.width *= object.scale.x;
//         if (object._physijs.height) object._physijs.height *= object.scale.y;
//         if (object._physijs.depth) object._physijs.depth *= object.scale.z;

//         this.execute('addObject', object._physijs);
//       }
//     }
//   }

//   remove(object) {
//     if (object instanceof Vehicle) {
//       this.execute('removeVehicle', {id: object._physijs.id});
//       while (object.wheels.length) this.remove(object.wheels.pop());

//       this.remove(object.mesh);
//       this._vehicles[object._physijs.id] = null;
//     } else {
//       Mesh.prototype.remove.call(this, object);

//       if (object._physijs) {
//         this._objects[object._physijs.id] = null;
//         this.execute('removeObject', {id: object._physijs.id});
//       }
//     }
//     if (object.material && object.material._physijs && this._materials_ref_counts.hasOwnProperty(object.material._physijs.id)) {
//       this._materials_ref_counts[object.material._physijs.id]--;

//       if (this._materials_ref_counts[object.material._physijs.id] === 0) {
//         this.execute('unRegisterMaterial', object.material._physijs);
//         this._materials_ref_counts[object.material._physijs.id] = null;
//       }
//     }
//   }

//   setFixedTimeStep(fixedTimeStep) {
//     if (fixedTimeStep) this.execute('setFixedTimeStep', fixedTimeStep);
//   }

//   setGravity(gravity) {
//     if (gravity) this.execute('setGravity', gravity);
//   }

//   simulate(timeStep, maxSubSteps) {
//     if (this._stats) this._stats.begin();

//     if (this._is_simulating) return false;

//     this._is_simulating = true;

//     for (const object_id in this._objects) {
//       if (!this._objects.hasOwnProperty(object_id)) continue;

//       const object = this._objects[object_id];

//       if (object !== null && (object.__dirtyPosition || object.__dirtyRotation)) {
//         const update = {id: object._physijs.id};

//         if (object.__dirtyPosition) {
//           update.pos = {
//             x: object.position.x,
//             y: object.position.y,
//             z: object.position.z
//           };

//           if (object._physijs.type === 'softbody') object.position.set(0, 0, 0);

//           object.__dirtyPosition = false;
//         }

//         if (object.__dirtyRotation) {
//           update.quat = {
//             x: object.quaternion.x,
//             y: object.quaternion.y,
//             z: object.quaternion.z,
//             w: object.quaternion.w
//           };

//           if (object._physijs.type === 'softbody') object.rotation.set(0, 0, 0);

//           object.__dirtyRotation = false;
//         }

//         this.execute('updateTransform', update);
//       }
//     }

//     this.execute('simulate', {timeStep, maxSubSteps});

//     if (this._stats) this._stats.end();
//     return true;
//   }
// }
