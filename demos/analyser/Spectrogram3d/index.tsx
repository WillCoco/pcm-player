// @ts-nocheck
import React, {
  Suspense,
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Chart from './chart';
import type { Spectrogram3dChartType } from './chart';

export type Spectrogram3dProps = {
  /**
   * @description 是否是流式音频
   */
  stream?: boolean;
  /**
   * @description 获取频域数据方法
   */
  getFrequencyData: Spectrogram3dChartType['getFrequencyData'];
  /**
   * @description canvas配置，见https://docs.pmnd.rs/react-three-fiber/
   * @default 见代码
   */
  canvas?: Record<string, any>;
  /**
   * @description 图表配置
   * @default 见代码
   */
  chart?: Spectrogram3dChartType;
  /**
   * @description orbitControls控制器配置，见https://threejs.org/docs/index.html?q=con#examples/en/controls/OrbitControls
   * @default 见代码
   */
  orbitControls?: typeof OrbitControls;
  /**
   * @description 控制是否绘制
   */
  draw?: boolean; // 是否绘制
  /**
   * @description 组件是否带canvas，true则不带，然后
   */
  pure?: boolean; // 是否绘制
};

export const Spectrogram3dWithoutCanvas = forwardRef((props: Spectrogram3dProps, ref) => {
  const {
    stream = true,
    getFrequencyData,
    canvas = {},
    chart = {},
    orbitControls = {},
    draw,
  } = props;
  const controlRef = React.useRef<any>();
  const chartRef = React.useRef<any>();

  const [drawing, setDrawing] = useState(true); // 内部是否绘制状态

  // 如未传入外部状态控制，则使用内部状态
  const finalDrawing = useMemo(() => {
    if (draw !== undefined) {
      return draw;
    }
    return drawing;
  }, [draw, drawing]);

  useImperativeHandle(ref, () => ({
    stopDrawing: () => setDrawing(false),
    startDrawing: () => setDrawing(true),
    clearDrawing: () => chartRef.current?.clear?.(),
  }));

  return (
    <>
      <Chart
        ref={chartRef}
        stream={stream}
        draw={finalDrawing}
        {...chart}
        getFrequencyData={getFrequencyData}
      />
      <OrbitControls
        ref={controlRef}
        makeDefault
        minDistance={20}
        maxDistance={50}
        rotateSpeed={0.5}
        enableDamping
        dampingFactor={0.2}
        maxPolarAngle={Math.PI / 2}
        {...orbitControls}
      />
    </>
  );
});

const Spectrogram3d = (props: Spectrogram3dProps, ref) => {
  const {
    stream = true,
    getFrequencyData,
    canvas = {},
    chart = {},
    orbitControls = {},
    draw,
    pure = false,
  } = props;
  const contentRef = React.useRef<any>();

  useImperativeHandle(ref, () => ({
    stopDrawing: () => contentRef.current?.stopDrawing?.(false),
    startDrawing: () => contentRef.current?.startDrawing?.(),
    clearDrawing: () => contentRef.current?.clearDrawing?.(true),
  }));

  return (
    <Canvas
      camera={{ fov: 45, near: 0.1, far: 100, position: [6, 15, 15] }}
      frameloop="always"
      {...canvas}
    >
      <Suspense fallback={null}>
        <Spectrogram3dWithoutCanvas {...props} ref={contentRef} />
      </Suspense>
    </Canvas>
  );
};

export default forwardRef(Spectrogram3d);
export { Spectrogram3dChartType };
