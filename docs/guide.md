---
title: 使用手册
---

## 简介

pcm 流播放器。以 websocket 等方式从服务端获取到 pcm 流并播放

## 安装

`npm i @gyzn/pcm-player --save`

## 使用

```jsx ｜ pure
import PCMPlayer from '@gyzn/pcm-player';

const player = new PCMPlayer({
  inputCodec: 'Int16',
  channels: 2,
  sampleRate: 8000,
  flushTime: 1000,
});

// 接收PCM格式的原始数据，ArrayBuffer 类型或者 TypedArray 类型
player.feed(pcm_data);

// 播放
player.play();
```

## 基础示例

<code src="../demos/basic.tsx">基础</code>

## 更新进度

  实时音频场景中，长时间播放后容易出现延迟，`refresh`方法可以舍弃未播放的缓存，更新进度。

  ```jsx | pure
  player.refresh({
    playAfterRefresh: true // 更新进度后是否立马播放，默认`true`
  })
  ```

<code src="../demos/refresh.tsx">更新进度</code>

## 通过分析节点绘制可视化效果

  通过内置的分析节点获取频域、时域数据，绘制效果

  通过`analyserOption`制定分析节点参数

<code src="../demos/analyser/index.tsx">可视化</code>

## 自定义音频处理脚本

  通过[audioworklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)修改音频输出。

  例子为修改成白噪音：

<code src="../demos/processor/index.tsx">白噪音</code>

## API

### PCMPlayer 构造参数 option

| 属性 | 说明 | 类型 | 默认值 | 是否必须 | 版本 |
| --- | --- | --- | --- | --- | --- |
| option.inputCodec | 编码 | `Int8` \| `Int16` \| `Int32` \| `Float32` | `Int16` |  |  |
| option.channels | 通道数 | number | 1 |  |  |
| option.sampleRate | PCM 数据的采样率 | number | 8000 |  |  |
| option.flushTime | PCM 数据的刷新间隔，以毫秒为单位。默认 1000 毫秒 | number | 1000(ms) |  |
| option.volume | 声音增益比例 | number | 1 |  |
| option.analyserOption | 分析节点配置 | AnalyserOption | {fftSize: 512} |  |
| option.biquadFilterOption | 滤波器 | BiquadFilterOption |  |  |
| option.processorScript | audioWorklet配置 | Object |  |

### PCMPlayer 方法

| 属性 | 说明 | 类型 | 版本 |
| --- | --- | --- | --- |
| player.feed | 通过 ws 等取到的数据喂给播放器的方法 | () => void |  |
| player.volume | 调节音量 | (volumeValue: number) => void |  |
| player.pause | 暂停 | (volumeValue: number) => void |  |
| player.continue | 继续播放 | () => void |  |
| player.destroy | 销毁 | () => void |  |
| player.refresh | 更新进度 | (option: {playAfterRefresh: boolean}) => Promise |  |

### AnalyserOption

  该配置应用于[AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize)，可配置项：

* fftSize
* frequencyBinCount
* maxDecibels
* minDecibels
* smoothingTimeConstant

### BiquadFilterOption

  该配置应用于[BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode/BiquadFilterNode)，可配置项：

* detune
* frequency
* gain
* Q
* type

### ProcessorScript

  该配置用于创建[AudioWorkletNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode)，可配置项：

* name: 注册的处理脚本模块名
* path: 处理脚本路径
