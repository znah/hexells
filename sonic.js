const defs = `
  const float PI = 3.14159265359;
  const vec2 wh = vec2(90.0, 50.0);
  const float border = 15.0;

  varying vec2 uv;
  varying float playingNote;
  varying float element;
`;

const vs_code = defs+`
    uniform sampler2D sonicTex;
    uniform vec2 viewSize;
    uniform vec2 sonicPos;
    uniform float progress;
  
    attribute vec4 vertex;

    float getElement(vec4 v, float i) {
      if (i<1.0) return v.x;
      if (i<2.0) return v.y;
      if (i<3.0) return v.z;
      return v.w;
    }

    const float sonicTexW = 16.0*12.0/4.0;

    float getChannel(float i, float ch) {
      float x = (floor(i*3.0 + ch/4.0)+0.5) / sonicTexW;
      vec4 v4 = texture2D(sonicTex, vec2(x, 0.0));
      return getElement(v4, mod(ch, 4.0));
    }

    void main() {
        vec2 pos = sonicPos;
        element = vertex.z;

        const float shift = -90.0;
        
        if (element == -2.0) {
          uv = vertex.xy;
          float r = 8.0*(viewSize.x+viewSize.y)/1000.0;
          pos += uv*r;
        } else if (element == -1.0) {
          pos += vec2(0.0, shift);
          uv = vertex.xy*(wh+border);
          pos += uv;
        } else {
          pos += vec2(0.0, shift);
          uv = vertex.xy;
          float i = floor(vertex.z / 9.0);
          float ch = mod(vertex.z, 9.0);
          float v = getChannel(i, ch+3.0); // skip RGB
          pos += vec2((ch+(i-7.5)/40.0)/4.0-1.0, 1.0-v*2.0) * wh;
          pos += vertex.xy*vec2(5.0, 5.0);
          playingNote = float(ch==progress);
        }
        gl_Position = vec4(pos/viewSize*2.0-1.0 , 0.0, 1.0);
        gl_Position.y *= -1.0;
      
    }`;

const fs_code =  'precision highp float;\n'+defs+`
    uniform sampler2D sonicTex;
    
    void main() {
      if (element == -2.0) {
        float v =  smoothstep(1.0, 0.8, length(uv));
        gl_FragColor = vec4(1.0, 1.0, 1.0, v*0.5);
      } else if (element == -1.0) {
        float v = smoothstep(border, 0.0, length(max(abs(uv)-wh, 0.0)));
        gl_FragColor = vec4(0.0, 0.0, 0.0, v*0.5);
      } else {
        float v = smoothstep(1.0, 0.0, length(uv));
        gl_FragColor = vec4(1.0, 1.0, 1.0, v*(0.1+playingNote*0.5));
      }
    }
`;


export class Sonic {
    constructor(gl, ca) {
      this.gl = gl;
      this.ca = ca;
      this.program = twgl.createProgramInfo(gl, [vs_code, fs_code]);

      const voiceN = 16;

      const pos = []; 
      for (let i=-2; i<9*voiceN; ++i) {
          pos.push(-1, -1, i, 1, -1, i, -1, 1, i, -1, 1, i, 1, -1, i, 1, 1, i);
      }
      this.quads = twgl.createBufferInfoFromArrays(gl, {vertex: pos});

      this.state = null;
      this._progress = -1; 
      this.env = new Tone.AmplitudeEnvelope({
        attack: 0.05,
        decay: 0.05,
        sustain: 0.5,
        release: 0.2
      }).toDestination();
      this.osc = Array(voiceN).fill().map(
        ()=>new Tone.Oscillator({type:'triangle'}).connect(this.env).start()
      );
      Tone.Transport.start();

      this.seq = new Tone.Sequence((time, i) => {
        if (!this.state || i>=9)
          return;
        this._progress = i;
        for (let j=0; j<voiceN; ++j) {
          const note = 220*Math.pow(2.0, this.state.buf[j*12+i+3]/128-1.0);
          this.osc[j].frequency.setValueAtTime(note, time);
        }
        this.env.triggerAttackRelease(0.05, time, 0.8/voiceN);
      }, [...Array(12-3+0).keys()], 1.0/8.0).start();

    }

    play(state) {
      this.state = state;
    }

    stop() {
      this.state = null;
      this._progress = -1;
    }

    progress() {
      return this._progress;
    }

    draw(viewSize) {
        if (!this.state)
            return;
        const gl = this.gl;
        gl.useProgram(this.program.program);
        twgl.setUniforms(this.program, {
          viewSize,
          sonicTex: this.state.tex,
          sonicPos:this.state.pos,
          progress: this._progress,
        });
        twgl.setBuffersAndAttributes(gl, this.program, this.quads);
        gl.enable(gl.BLEND)
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        twgl.drawBufferInfo(gl, this.quads);
        gl.disable(gl.BLEND)
    }
  };