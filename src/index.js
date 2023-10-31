import Observer from "./observer"

const EVENTS = {
  'REFRESH': 'REFRESH',
  'PAUSE': 'PAUSE',
  'PLAY': 'PLAY',
  'RESUME': 'RESUME',
}

const STATES = {
  'NOT_PLAYED': 'NOT_PLAYED',
  'PLAYED': 'PLAYED',
  'PAUSED': 'PAUSED',
}

class PCMPlayer extends Observer {
  bridgeNode
  state = STATES.NOT_PLAYED
  bufferSource
  bufferSourceHistories
  refreshing = 0 // 刷新次数
  interval
  cacheCheckInterval
  analyser

  constructor(option) {
    super()
    this.init(option)
  }

  /**
   * 初始化
   */
  init(option) {
    const defaultOption = {
      inputCodec: 'Int16', // 传入的数据是采用多少位编码，默认16位
      channels: 1, // 声道数
      sampleRate: 8000, // 采样率 单位Hz
      flushTime: 1000, // flush间隔时间 单位 ms
      cacheTime: 500, // 首次缓冲时长 单位 ms
      volume: 1, // 初始音量
      analyserOption: { // 分析节点
        fftSize: 512
      },
      biquadFilterOption: undefined, // 滤波器
      processorScript: undefined, // audioWorklet配置
    }

    this.option = Object.assign({}, defaultOption, option) // 实例最终配置参数
    this.samples = new Float32Array() // 样本存放区域
    this.convertValue = this.getConvertValue()
    this.typedArray = this.getTypedArray()
    this.initAudioContext()
  }

  getConvertValue() {
    // 根据传入的目标编码位数
    // 选定转换数据所需要的基本值
    const inputCodecs = {
      'Int8': 128,
      'Int16': 32768,
      'Int32': 2147483648,
      'Float32': 1
    }
    if (!inputCodecs[this.option.inputCodec]) {
      throw new Error('wrong codec.please input one of these codecs:Int8,Int16,Int32,Float32')
    }
    return inputCodecs[this.option.inputCodec]
  }

  getTypedArray() {
    // 根据传入的目标编码位数
    // 选定前端的所需要的保存的二进制数据格式
    // 完整TypedArray请看文档
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
    const typedArrays = {
      'Int8': Int8Array,
      'Int16': Int16Array,
      'Int32': Int32Array,
      'Float32': Float32Array
    }
    if (!typedArrays[this.option.inputCodec]) {
      throw new Error('wrong codec.please input one of these codecs:Int8,Int16,Int32,Float32')
    }
    return typedArrays[this.option.inputCodec]
  }

  async initAudioContext() {
    // 初始化音频上下文的东西
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.option.sampleRate
    })
    // 分析节点
    this.analyser = this.audioCtx.createAnalyser()
    Object
      .entries(this.option.analyserOption)
      .forEach(([key, value]) => {
        this.analyser[key] = value;
      })

    // 处理节点
    let scriptProcessorNode
    if (this.option.processorScript) {
      const {name, path} = this.option.processorScript
      try {
        await this.audioCtx.audioWorklet.addModule(path)
        scriptProcessorNode = new AudioWorkletNode(
          this.audioCtx,
          name
        );
      } catch (error) {
        console.error('加载audioWorklet脚本错误', error)
      }
    }

    // 滤波器节点
    const {biquadFilterOption} = this.option;
    const biquadFilterNode = biquadFilterOption ? this.audioCtx.createBiquadFilter() : false
    if (biquadFilterNode) {
      const {detune, type, Q, frequency, gain} = biquadFilterOption
      if (detune) {
        biquadFilterNode.detune = detune
      }
      if (type) {
        biquadFilterNode.type = type
      }
      if (Q) {
        biquadFilterNode.Q.value = Q
      }
      if (frequency) {
        biquadFilterNode.frequency.value = frequency
      }
      if (gain) {
        biquadFilterNode.gain.value = gain
      }
    }

    // 中间节点列表
    this.middlewareNodes = []
    if (biquadFilterNode) {
      this.middlewareNodes.push(biquadFilterNode)
    }
    this.middlewareNodes.push(this.analyser)
    if (scriptProcessorNode) {
      this.middlewareNodes.push(scriptProcessorNode)
    }

    // 控制音量的 GainNode
    // https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createGain
    this.gainNode = this.audioCtx.createGain()
    this.gainNode.gain.value = this.option.volume
    this.gainNode.connect(this.audioCtx.destination)
    this.startTime = this.audioCtx.currentTime
    // 中间节点 =》 gainNode
    this.middlewareNodes.reduce((prev, next) => {
      prev.connect(next)
      return next
    })
    this.middlewareNodes[this.middlewareNodes.length - 1].connect(this.gainNode)
    this.bridgeNode = this.middlewareNodes[0]
  }

  static isTypedArray(data) {
    // 检测输入的数据是否为 TypedArray 类型或 ArrayBuffer 类型
    return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer) || data.constructor == ArrayBuffer;
  }

  /**
   * 监测是否支持的数据类型方法
   */
  isSupported(data) {
    // 数据类型是否支持
    // 目前支持 ArrayBuffer 或者 TypedArray
    if (!PCMPlayer.isTypedArray(data)) {
      throw new Error('请传入ArrayBuffer或者任意TypedArray')
    }
    return true
  }

  /**
   * 喂数据方法
   */
  feed(data) {
    this.isSupported(data)
    if (!this.samples) return;

    // 缓存数据达到阈值，则保存最新阈值长度的数据
    // const sizeThreshold = ~~(this.flushTime * this.sampleRate / 1000 / 8) * 2
    // if (this.samples && this.samples.length >= sizeThreshold) {
    //   this.samples = this.samples.slice(-sizeThreshold)
    // }

    // 获取格式化后的buffer
    data = this.getFormatedValue(data);
    // 开始拷贝buffer数据
    // 新建一个Float32Array的空间
    const tmp = new Float32Array(this.samples.length + data.length);
    // console.log(data, this.samples, this.samples.length)
    // 复制当前的实例的buffer值（历史buff)
    // 从头（0）开始复制
    tmp.set(this.samples, 0);
    // 复制传入的新数据
    // 从历史buff位置开始
    tmp.set(data, this.samples.length);
    // 将新的完整buff数据赋值给samples
    // interval定时器也会从samples里面播放数据
    this.samples = tmp;
  }

  /**
   * format数据
   */
  getFormatedValue(data) {
    if (data.constructor == ArrayBuffer) {
      data = new this.typedArray(data)
    } else {
      data = new this.typedArray(data.buffer)
    }

    let float32 = new Float32Array(data.length)

    for (let i = 0; i < data.length; i++) {
      // buffer 缓冲区的数据，需要是IEEE754 里32位的线性PCM，范围从-1到+1
      // 所以对数据进行除法
      // 除以对应的位数范围，得到-1到+1的数据
      // float32[i] = data[i] / 0x8000;
      float32[i] = data[i] / this.convertValue
    }
    return float32
  }

  /**
   * 调整音量
   */
  volume(volume) {
    this.gainNode.gain.value = volume
  }

  /**
   * 监测是否完成播放
   */
  cacheCompleted() {
    const cachedTime = this.samples.length / this.option.channels / this.option.sampleRate * 1000
    return cachedTime >= this.option.cacheTime;
  }

  /**
   * 开始flush，在缓冲数据达到可播放状态时开始播放第一个bufferSource
   */
  startFlush() {
    if (this.interval) {
      clearInterval(this.interval)
    }
    this.flush()
    this.interval = setInterval(this.flush.bind(this), this.option.flushTime)
    this.fireEvent(EVENTS.RESUME)
  }

  /**
   * 准备播放
   */
  play() {
    this.state = STATES.PLAYED
    if (this.cacheCompleted()) {
      this.startFlush()
    }
    this.cacheCheckInterval = setInterval(() => {
      if (this.cacheCompleted()) {
        this.startFlush()
        clearInterval(this.cacheCheckInterval)
      }
    }, 300)
  }

  /**
   * 组织一次音频块播放
   */
  flush() {
    if (!this.samples.length) return
    if (!this.bufferSourceHistories) {
      this.bufferSourceHistories = []
    }
    if (this.bufferSource) {
      this.bufferSourceHistories.push(this.bufferSource)
      // 添加监听，如果播放结束，则移出播放中、未播放列表
      const currentBufferSource = this.bufferSource;
      currentBufferSource.addEventListener('ended', (e) => {
        const targetIndex = this.bufferSourceHistories?.findIndex(bs => bs === currentBufferSource)
        if (targetIndex >= 0) {
          this.bufferSourceHistories.splice(targetIndex, 1)
        }
      })
    }
    this.bufferSource = this.audioCtx.createBufferSource()
    const length = this.samples.length / this.option.channels
    const audioBuffer = this.audioCtx.createBuffer(this.option.channels, length, this.option.sampleRate)

    for (let channel = 0; channel < this.option.channels; channel++) {
      const audioData = audioBuffer.getChannelData(channel)
      let offset = channel
      let decrement = 50
      for (let i = 0; i < length; i++) {
        audioData[i] = this.samples[offset]
        /* fadein */
        if (i < 50) {
          audioData[i] = (audioData[i] * i) / 50
        }
        /* fadeout*/
        if (i >= (length - 51)) {
          audioData[i] = (audioData[i] * decrement--) / 50
        }
        offset += this.option.channels
      }
    }

    if (this.startTime < this.audioCtx.currentTime) {
      this.startTime = this.audioCtx.currentTime
    }
    // console.log('start vs current ' + this.startTime + ' vs ' + this.audioCtx.currentTime + ' duration: ' + audioBuffer.duration);
    this.bufferSource.buffer = audioBuffer
    this.bufferSource.connect(this.bridgeNode)
    this.bufferSource.start(this.startTime)
    this.startTime += audioBuffer.duration
    this.samples = new Float32Array()
  }

  /**
   * 暂停播放
   */
  async pause() {
    await this.audioCtx.suspend()
    this.state = STATES.PAUSED
    this.fireEvent(EVENTS.PAUSE)
  }

  /**
   * 继续播放
   */
  async continue() {
    await this.audioCtx.resume()
    this.state = STATES.PLAYED
    this.fireEvent(EVENTS.RESUME)
  }

  // async refresh({playAfterRefresh = true, replayTime = this.option.flushTime} = {}) {
  //   const volume = this.gainNode.gain.value
  //   this.destroy(false)
  //   const cOption = {
  //     ...this.option,
  //     volume
  //   }
  //   this.init(cOption)
  //   const currentRefreshingIndex = ++this.refreshing
  //   return new Promise((resolve, reject) => {
  //     setTimeout(async () => {
  //       if (currentRefreshingIndex === this.refreshing) {
  //         if (playAfterRefresh) {
  //           this.play();
  //         }
  //         this.fireEvent(EVENTS.REFRESH)
  //         resolve();
  //       } else {
  //         reject();
  //       }
  //     }, replayTime)
  //   })
  // }

  /**
   * 舍弃未播放的缓存，跟进实时播放进度
   */
  async refresh({playAfterRefresh = true} = {}) {
    const volume = this.gainNode.gain.value
    this.destroy(false)
    const cOption = {
      ...this.option,
      volume
    }
    this.init(cOption)
    if (playAfterRefresh) {
      this.play()
    }
    return Promise.resolve()
  }

  /**
   * 销毁
   */
  destroy(unAll) {
    if (this.interval) {
      clearInterval(this.interval)
    }
    if (this.cacheCheckInterval) {
      clearInterval(this.cacheCheckInterval)
    }
    if (unAll) {
      this.unAll()
    }
    this.samples = null
    this.volume(0);// 静音（部分sourceNode已经停不下来）
    this.bufferSource?.stop?.()
    this.audioCtx?.destroy?.()
    this.audioCtx = null
    this.bufferSource = null
    this.bridgeNode = null
    this.bufferSourceHistories?.forEach(bs => {
      bs?.stop?.()
    })
    this.bufferSourceHistories = null
    this.analyser = null
  }
}

export default PCMPlayer
