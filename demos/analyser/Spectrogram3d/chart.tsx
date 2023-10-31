/// @ts-nocheck
import React, { useRef, useMemo, useCallback, useImperativeHandle } from 'react';
import { GizmoHelper, GizmoViewport, Text, Billboard, Html } from '@react-three/drei';
import { useLoader, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './line_material';
import colorsPng from './colors.png';

const DEFAULT_OBJ = Object.freeze({}) as any;

const INIT_CHART_DATA = [];

export type AxisType = {
  fontSize?: number;
  color?: number | string;
  labelQuantity?: number; // 坐标label数量
  offset?: number; // 偏移
  labelFormatter?: (v: number) => number | string; // 转换方法
};

export type Spectrogram3dChartType = {
  /**
   * @description 非流式音频下的频率数据, 二维数组，图表每列的数值
   */
  chartData?: number[][];
  /**
   * @description 获取频域数据方法, 由<a href="/components/audio/audio-visualization-3d#api"></a>
   */
  getFrequencyData?: () => Uint8Array | undefined;
  /**
   * @description 是否绘制
   */
  draw?: boolean;
  /**
   * @description 每次绘制步长
   * @default 0.01
   */
  frameStep?: number;
  /**
   * @description 数据长度, z方向柱子数量，影响z方向线条密度
   * @default 200
   */
  dataLength?: number; // 数据长度, z方向柱子数量
  /**
   * @description 数据长度, x方向柱子数量，影响x方向线条密度
   * @default 200
   */
  barXQuantity?: number;
  /**
   * @description 网格配置
   * @default{ size?: 10; quantity?: 10; color?: #999; }
   */
  grid?: {
    size?: number;
    quantity?: number;
    color?: number | string;
  };
  /**
   * @description 坐标轴配置
   * @default 见代码
   */
  axes?: {
    y?: AxisType;
    z?: AxisType;
  };
  /**
   * @description 音频参数配置，分析节点的db上下限值和频率上限
   * @default{maxDecibels: -10, minDecibels: -100, maxFrequency:: 24000}
   */
  audio?: {
    maxDecibels?: number;
    minDecibels?: number;
    maxFrequency?: number;
  };
  /**
   * @description 色带图，一般为1x256的png图片
   * @default 见代码
   */
  colorMap?: any;
  /**
   * @description 是否显示GizmoHelper
   * @default false
   */
  showGizmoHelper?: boolean; // 是否展示gizmoHelper
};

const Spectrogram3dChart = (
  props: Spectrogram3dChartType,
  ref: React.MutableRefObject<{ clear: () => void }>,
) => {
  const {
    stream = true,
    chartData = INIT_CHART_DATA,
    draw = true,
    grid: { size: gridSize = 10, quantity: gridsQuantity = 10, color: gridColor = '#999' } = {},
    axes: {
      y: {
        fontSize: yLabelFontSize = 14,
        color: yLabelColor = '#222',
        labelQuantity: yAxisQuantity = 5,
        labelFormatter: yLabelFormatter = undefined,
        offset: yLabelOffset = 0.6,
      } = DEFAULT_OBJ,
      z: {
        fontSize: zLabelFontSize = 14,
        color: zLabelColor = '#222',
        labelQuantity: zAxisQuantity = 5,
        labelFormatter: zLabelFormatter = undefined,
        offset: zLabelOffset = 0.6,
      } = DEFAULT_OBJ,
    } = DEFAULT_OBJ,
    dataLength = 200,
    barXQuantity = 200,
    audio: { maxDecibels = -10, minDecibels = -100, maxFrequency = 24000 } = DEFAULT_OBJ,
    getFrequencyData = () => DEFAULT_OBJ,
    frameStep = 0.01,
    colorMap = colorsPng,
    showGizmoHelper,
  } = props;

  const materRef = useRef<any>(); // 材质Ref
  const offsetRef = useRef<any>(); // offset属性Ref
  const currentOffset = useRef(-0.1); // 累计偏移Ref
  const dataRef = useRef<Uint8Array>(); // 频域数据Ref

  const totalBarQuantity = Math.ceil(dataLength * barXQuantity); // 总线段数量
  const barZPerSize = gridSize / dataLength; // z轴方向每个线段占据位置
  const barXPerSize = gridSize / barXQuantity; // x轴方向每个线段占据位置
  const [colorsImg] = useLoader(THREE.TextureLoader, [colorMap]); // 色带

  // 实例偏移量
  const offsets = useMemo(() => {
    const data: number[] = [];
    for (let j = 0; j < barXQuantity; j++) {
      const x = barXPerSize * j - gridSize / 2;
      for (let i = 0; i < dataLength; i++) {
        const z = barZPerSize * i - gridSize / 2;
        data.push(x, 0, z);
      }
    }
    return data;
  }, [totalBarQuantity]);

  // powers频率能量
  const powersZero = useMemo(() => {
    return Array.from({ length: totalBarQuantity }).map(() => 0);
  }, [totalBarQuantity]);

  const powers = useMemo(() => {
    if (!chartData?.length) return chartData;
    const result = [];
    for (let i = 0; i < dataLength; i++) {
      const fi = Math.min(Math.round((i * chartData.length) / dataLength), chartData.length - 1); // 重采样x坐标，i映射成横坐标
      const column = chartData[fi];
      for (let j = barXQuantity - 1; j >= 0; j--) {
        const fj = Math.min(Math.round((j * column.length) / barXQuantity), column.length - 1); // 重采样坐
        result.push(column[fj] || 0);
      }
    }
    return result;
  }, [chartData, dataLength, barXQuantity]);

  // instancedBufferGeometry 的属性构造参数
  const offsetsAttribute = useMemo(() => [new Float32Array(offsets), 3], [offsets]);

  const powersAttribute = useMemo(() => {
    return [new Float32Array(stream ? powersZero : powers), 1];
  }, [powers]);
  const boxOffsetAttribute = useMemo(() => [new Float32Array([-gridSize, 0, 0]), 3], []);

  // 线段几何体
  const baseGeom = useMemo(() => {
    const bufferGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([0.0, -5.0, 0.0, 0.0, 5.0, 0.0]);
    const uvVertices = new Float32Array([0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
    bufferGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    bufferGeometry.setAttribute('uv', new THREE.BufferAttribute(uvVertices, 3));
    return bufferGeometry;
  }, []);

  // 实例列表
  const instancedArray = useMemo(
    () => Array.from({ length: totalBarQuantity }),
    [totalBarQuantity],
  );

  // y坐标, db坐标
  const yAxis = useMemo(() => {
    const decibelStep = (maxDecibels - minDecibels) / yAxisQuantity;
    const positionStep = gridSize / yAxisQuantity;
    const yAxisData = Array.from({ length: yAxisQuantity + 1 }).map((v, i) => {
      const value = parseFloat((minDecibels + decibelStep * i).toFixed(1));
      return {
        value: yLabelFormatter ? yLabelFormatter(value) : value,
        position: i * positionStep - gridSize / 2,
      };
    });
    return {
      data: yAxisData,
    };
  }, [maxDecibels, minDecibels, gridSize, yAxisQuantity, yLabelFormatter]);

  // z坐标, 频率坐标
  const zAxis = useMemo(() => {
    const frequencyStep = maxFrequency / zAxisQuantity;
    const positionStep = gridSize / zAxisQuantity;
    const zAxisData = Array.from({ length: zAxisQuantity + 1 }).map((v, i) => {
      const value = parseFloat((frequencyStep * (zAxisQuantity - i)).toFixed(1));
      return {
        value: zLabelFormatter ? zLabelFormatter(value) : value,
        position: i * positionStep - gridSize / 2,
      };
    });
    return {
      data: zAxisData,
    };
  }, [maxFrequency, zAxisQuantity, zLabelFormatter]);

  // 每帧更新频域数据
  useFrame(() => {
    if (!draw) return;
    if (!stream) return;
    dataRef.current = getFrequencyData() || [];
  });

  // 每帧根据当前频域数据更新图表
  useFrame(() => {
    if (!draw) return;
    if (!offsetRef.current) return;
    if (!materRef.current) return;
    if (!dataRef.current) return;
    // 静态音频
    if (!stream) return;
    // 超出边界则回到队尾，并更新队尾
    let dataIndex = dataLength - 1;
    const rate = (dataRef.current?.length || 0) / dataLength;
    instancedArray.forEach((d, index) => {
      const x = offsetRef.current.attributes.offset.getX(index);
      if (currentOffset.current + x - 0.05 <= -gridSize / 2 - 0.15) {
        offsetRef.current.attributes.offset.setX(index, x + gridSize);
        const targetIndex = Math.round(rate * dataIndex);
        dataIndex -= 1;
        offsetRef.current.attributes.power.setX(index, (dataRef.current?.[targetIndex] || 0) / 255);
      }
    });

    // 移动
    currentOffset.current -= frameStep;
    materRef.current.uniforms.boxOffset.value.setX(currentOffset.current);
    offsetRef.current.attributes.offset.needsUpdate = true;
    offsetRef.current.attributes.power.needsUpdate = true;
  });

  // 清空方法
  const clear = useCallback(() => {
    if (!stream) return;
    try {
      offsetRef.current.attributes.power.set(Array.from({ length: totalBarQuantity }).fill(0));
    } catch (error) {
      console.error('error when clear power', error);
    }
  }, [totalBarQuantity]);

  useImperativeHandle(ref, () => {
    return { clear };
  });

  return (
    <>
      {/* 坐标网格 */}
      <gridHelper
        args={[gridSize, gridsQuantity, gridColor, gridColor]}
        position={[0, -gridSize / 2 - 0.01, 0]}
      />
      <gridHelper
        args={[gridSize, gridsQuantity, gridColor, gridColor]}
        position={[0, 0, -gridSize / 2 - 0.01]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <gridHelper
        args={[gridSize, gridsQuantity, gridColor, gridColor]}
        position={[-gridSize / 2 - 0.01, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      />
      {/* 坐标值 */}
      {
        // y坐标
        <group
          position={[
            -gridSize / 2,
            0,
            gridSize / 2 + yLabelOffset,
          ]} /*  rotation={[0,Math.PI/2,0]} */
        >
          {yAxis.data.map((item, index) => {
            return (
              <Billboard
                key={`${item.value}_${index}`}
                follow
                lockX={false}
                lockY={false}
                lockZ={false}
                position={[0, item.position, 0]}
              >
                <Html>
                  <div
                    style={{
                      color: yLabelColor,
                      fontSize: yLabelFontSize,
                      userSelect: 'none',
                      transform: `translate(-50%, -50%)`,
                    }}
                  >
                    {item.value}
                  </div>
                </Html>
              </Billboard>
            );
          })}
        </group>
      }
      {
        // z坐标
        <group
          position={[
            gridSize / 2 + zLabelOffset,
            -gridSize / 2,
            0,
          ]} /*  rotation={[0,Math.PI/2,0]} */
        >
          {zAxis.data.map((item, index) => {
            return (
              <Billboard
                key={`${item.value}_${index}`}
                follow
                lockX={false}
                lockY={false}
                lockZ={false}
                position={[0, 0, item.position]}
              >
                <Html>
                  <div
                    style={{
                      color: zLabelColor,
                      fontSize: zLabelFontSize,
                      userSelect: 'none',
                      transform: `translate(-50%, -50%)`,
                    }}
                  >
                    {item.value}
                  </div>
                </Html>
              </Billboard>
            );
          })}
        </group>
      }
      {/* 瀑布数据 */}
      <group>
        <lineSegments>
          <instancedBufferGeometry
            index={baseGeom.index}
            attributes-position={baseGeom.attributes.position}
            attributes-uv={baseGeom.attributes.uv}
            ref={offsetRef}
          >
            <instancedBufferAttribute attach="attributes-offset" args={offsetsAttribute} />
            <instancedBufferAttribute attach="attributes-power" args={powersAttribute} />
            <instancedBufferAttribute
              attach="uniforms"
              name="boxOffset"
              args={boxOffsetAttribute}
            />
          </instancedBufferGeometry>
          <customMaterial ref={materRef} map={colorsImg} toneMapped={false} />
        </lineSegments>
      </group>
      {showGizmoHelper ? (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['red', 'green', 'blue']} labelColor="black" />
        </GizmoHelper>
      ) : null}
    </>
  );
};

export default React.forwardRef(Spectrogram3dChart);
