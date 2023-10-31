import React, { useRef } from 'react';
import PCMPlayer from '../../src';
import Spectrogram3d from './Spectrogram3d'
import '../style.less';

export default () => {
  const ws = useRef<WebSocket>();
  const player = useRef<PCMPlayer>();
  const dataRef = useRef<any>();
  const spectrogram3dRef = useRef<any>();

  if (!player.current) {
    player.current = new PCMPlayer({
      inputCodec: 'Int16', // 传入的数据是采用多少位编码，默认16位
      channels: 2, // 声道数
      sampleRate: 8000, // 采样率 单位Hz
      flushTime: 1000, // 缓存时间 单位 ms
      volume: 1, // 初始音量
    });
  }

  const load = () => {
   if (ws.current) {
      ws.current.close();
    }
    ws.current = new WebSocket('ws://localhost:8880');
    ws.current.binaryType = 'arraybuffer';
    ws.current.addEventListener('message', function (event) {
      // 可以传 ArrayBuffer 或者 任意TypedArray
      if (player.current) {
        player.current.feed(event.data);
      }
    });
  }

  const play = () => {
    if (player.current?.state === 'PAUSED') {
      player.current?.continue()
    } else {
      player.current?.play();
    }
  }

  const loadAndPlay = () => {
    load();
    play();
    spectrogram3dRef.current.startDrawing();
  }

  const stop = () => {
    player.current?.pause();
    ws.current?.close();
    spectrogram3dRef.current.stopDrawing();
  }

  const getFrequencyData = () => {
    if (!dataRef.current) {
      dataRef.current = new Uint8Array(player.current?.analyser.frequencyBinCount || 512);
    }
    if (!player.current?.analyser) return dataRef.current;
    player.current?.analyser?.getByteFrequencyData(dataRef.current);
    return dataRef.current;
  };

  return (
    <div>
      <div style={{height: 320}}>
        <Spectrogram3d
          ref={spectrogram3dRef}
          stream
          getFrequencyData={getFrequencyData}
          chart={{
            grid: {
              color: '#ccc'
            },
            axes: {
              z: {
                labelFormatter: () => ``
              },
              y: {
                labelFormatter: () => ``
              }
            }
          }}
        />
      </div>
      <div className="btns-wrap">
        <button onClick={loadAndPlay}>开始</button>
        <button onClick={stop}>暂停</button>
      </div>
    </div>
  )
};
