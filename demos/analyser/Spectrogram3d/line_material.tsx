// @ts-nocheck
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const CustomMaterial = shaderMaterial(
  {
    map: null,
    time: 0,
    power: null,
    offset: null,
    boxOffset: new THREE.Vector3(0,0,0),
  },
  `   precision mediump float;
      attribute vec3 offset;
      uniform vec3 boxOffset;
      attribute float power;
      varying float vPower;
      varying vec2 vUv;

      void main() {
        //UV for texture
        vUv = uv;
        vPower = power;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(offset + position + boxOffset, 1.0);
      }`,
      `precision mediump float;
      uniform sampler2D map;
      varying vec2 vUv;
      varying float vPower;

      void main() {
        // //Get transparency information from alpha map
        vec4 rgba = texture2D(map, vUv);
        //If transparent, don't draw
        gl_FragColor = rgba;
        if (vUv.y < vPower - 0.35 || vUv.y > vPower || vUv.y < 0.01) {
          discard;
        }

        #include <tonemapping_fragment>
	      #include <encodings_fragment>
      }`,
  (self) => {
    self.side = THREE.DoubleSide;
  },
);

extend({ CustomMaterial });
