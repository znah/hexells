export class Sonic {
    constructor(gl) {
      this.gl = gl;
      
      this.state = null;
      this._progress = -1;
      this.env = new Tone.AmplitudeEnvelope({
        attack: 0.05,
        decay: 0.05,
        sustain: 0.5,
        release: 0.2
      }).toDestination(); 
      const voiceN = 16;
      this.osc = Array(voiceN).fill().map(()=>new Tone.Oscillator({type:'triangle', volume: -35}).connect(this.env));       
      Tone.Transport.start();

      this.seq = new Tone.Sequence((time, i) => {
        i +=3;
        this._progress = i;
        if (!this.state || i>=12)
          return;
        for (let j=0; j<voiceN; ++j) {
          const note = 220*Math.pow(2.0, this.state[j*12+i]/128-1.0);
          this.osc[j].frequency.setValueAtTime(note, time);
        }
        this.env.triggerAttackRelease(0.05, time);
      }, [...Array(12-3+0).keys()], 1.0/8.0);

    }

    start(state) {
      if (this.seq.state == 'stopped')
        this.seq.start();
      this.update(state);
      this.osc.forEach(o=>o.start());
    }

    stop() {
      this.osc.forEach(o=>o.stop());
      this.seq.stop();
      this._progress = -1;
    }

    update(state) {
      this.state = state;
    }

    progress() {
      return this._progress;
    }

    draw(videSize) {

    }
  };