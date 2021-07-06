import { CA } from "./ca.js"
// import { Sonic } from "./sonic.js"


const $ = q => document.querySelector(q);

export class Demo {
    constructor(canvas, isScreenMode) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl", { alpha: false });

        this.brushRadius = 16;
        this.stepPerFrame = 1;

        this.isScreenMode = isScreenMode;
        this.serverUrl = 'wss://hexells.glitch.me/';
        this.ws = null;
        this.controlWS = null;

        const gui = this.gui = new dat.GUI();
        gui.hide();
        gui.add(this, 'brushRadius', 1, 40);
        gui.add(this, 'stepPerFrame', 0, 6, 1);

        fetch('models.json').then(r => r.json()).then(models => {
            this.ca = new CA(this.gl, models, [160, 160], gui, ()=>this.setup(models));
        })
    }

    setup(models) {
        //this.sonic = new Sonic(gl, ca);
        const canvas = this.canvas;

        this.shuffledModelIds = models.model_names.map((_, i)=>[Math.random(), i]).sort().map(p=>p[1]);
        //132, 141, 149, 134, 168, 40, 104, 37, 64, 12
        this.curModelIndex = this.shuffledModelIds.indexOf(149); // "coral"
        this.modelId = this.shuffledModelIds[this.curModelIndex];
        this.ca.paint(0, 0, -1, this.modelId);

        this.guesture = null;

        const mouseEvent = f=>e=>{
            e.preventDefault();
            f([e.offsetX, e.offsetY], e);
        };
        const touchEvent = f=>e=>{
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            for (const t of e.touches) {
                const xy = [t.clientX - rect.left, t.clientY - rect.top];
                f(xy, e);
            }
        }

        canvas.addEventListener("mousedown", mouseEvent((xy, e)=>{
            if (e.buttons == 1) {
                this.startGestue(xy);
                this.touch(xy);
            }
        }));
        canvas.addEventListener("mousemove", mouseEvent((xy, e)=>{
            if (e.buttons == 1) {
                this.touch(xy);
            }
        }));
        canvas.addEventListener("mouseup", mouseEvent(xy=>this.endGestue(xy)));
        
        canvas.addEventListener("touchstart", touchEvent((xy, e)=>{
            if (e.touches.length == 1) {
                this.startGestue(xy);
            } else {
                this.gesture = null; // cancel guesture
            }
            this.touch(xy);
        }));
        canvas.addEventListener("touchmove", touchEvent(xy => this.touch(xy)));
        canvas.addEventListener("touchend", xy => this.endGestue(xy));

        document.addEventListener('keypress', e=>{
            if (e.key == 'a') this.switchModel(1);
            if (e.key == 'z') this.switchModel(-1);
        });

        this.connect();

        requestAnimationFrame(()=>this.render());
    }

    connect() {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.addEventListener('open', ()=>{
            console.log('connected to', this.serverUrl);
        });
        const tryReconnect = e=>{
            if (!this.ws)
              return; // reconnect is already pending
            console.log('Socket closed');
            this.ws = null;
            setTimeout(()=>this.connect(), 3000);
        };
        this.ws.addEventListener('close', tryReconnect);
        this.ws.addEventListener('error', tryReconnect);
        this.ws.addEventListener('message', e=>{
            const data = JSON.parse(e.data)
            this.processMessage(data);
        });
    }

    processMessage(msg) {
        if (this.isControlling())
            return;
        if ('modelId' in msg) {
            this.setModel(msg.modelId);
        }
        if ('touch' in msg) {
            const [x, y] = msg.touch;
            const viewSize = this.getViewSize();
            const [w, h] = viewSize
            const s = Math.max(w, h);
            this.ca.clearCircle(x*s+w/2, y*s+h/2, this.brushRadius, viewSize);
        }
    }

    isControlling() {
        return !!this.controlWS && this.controlWS.readyState == WebSocket.OPEN;
    }
    tryControl(msg) {
        if (this.isControlling()) {
            this.controlWS.send(JSON.stringify(msg));
        }
    }

    connectControl() {
        if (!this.isControlling()) {
            const url = this.serverUrl+'control';
            const controlWS = this.controlWS = new WebSocket(url);
            controlWS.addEventListener('open', ()=>{
                console.log('connected to', url);
                this.tryControl({modelId:this.modelId});
            });
            controlWS.onclose = controlWS.onerror = e=>{
                if (e.reason == 'busy') {
                    $('#status').innerText = 'control is busy, try later';
                    $('#status').style.opacity = 1;
                    setTimeout(()=>{$('#status').style.opacity = 0;}, 2000);
                } else {
                    $('#status').style.opacity = 0;
                }
                console.log(`control disconnected (${e.reason})`);
                if (this.controlWS == controlWS) {
                    this.controlWS = null;
                }
            }
            controlWS.onmessage = e=>{
                $('#status').innerText = e.data;
                $('#status').style.opacity = 1;
            };
        }
    }    

    startGestue(pos) {
        this.gesture = {
            l: 0, r: 0, u: 0, d: 0,
            prevPos: pos,
            time: Date.now(),
        };
    }

    touch(xy) {
        const [x, y] = xy;
        const g = this.gesture;
        if (g) {
            const [x0, y0] = g.prevPos;
            g.l += Math.max(x0-x, 0.0);
            g.r += Math.max(x-x0, 0.0);
            g.u += Math.max(y0-y, 0.0);
            g.d += Math.max(y-y0, 0.0);
            g.prevPos = xy;
        }        
        const viewSize = [this.canvas.clientWidth, this.canvas.clientHeight];
        this.ca.clearCircle(x, y, this.brushRadius, viewSize);
        const [w, h] = viewSize;
        const s = Math.max(w, h);
        const nx=(x-w/2)/s, ny = (y-h/2)/s;
        this.tryControl({touch: [nx.toFixed(4), ny.toFixed(4)]});
    }

    endGestue(pos) {
        if (!this.gesture) {
            return;
        }
        if (Date.now() - this.gesture.time < 1000) {
            const { l, r, u, d } = this.gesture;
            if (l > 200 && Math.max(r, u, d) < l * 0.25) {
                this.switchModel(-1);
            } else if (r > 200 && Math.max(l, u, d) < r * 0.25) {
                this.switchModel(1);
            } else if (u > 200 && Math.max(l, r, d) < u * 0.25) {
                console.log('up!');
                // const url = document.location.href.split('?')[0]+'?'+Math.random();
                // document.location.href = url;
                this.connectControl();

            }
            
        }
        this.gesture = null;
    }

    switchModel(swipe) {
        const n = this.shuffledModelIds.length;
        this.curModelIndex = (this.curModelIndex+n+swipe) % n;
        const id = this.shuffledModelIds[this.curModelIndex];
        this.setModel(id);
        this.tryControl({modelId:id});
    }

    setModel(id) {
        this.modelId = id;
        this.ca.paint(0, 0, -1, id);
        this.ca.disturb();
        window.location.hash = id;
    }

    getViewSize() {
        return [this.canvas.clientWidth, this.canvas.clientHeight];
    }

    render() {
        for (let i=0; i<this.stepPerFrame; ++i) {
            this.ca.step();
        }
        const canvas = this.canvas;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);


        twgl.bindFramebufferInfo(this.gl);
        this.ca.draw(this.getViewSize(), 'color');
        requestAnimationFrame(()=>this.render());
    }

    screenshot(name) {
        const canvas = this.canvas;
        canvas.width = 2412;
        canvas.height = 3074;
        const viewSize = [canvas.width, canvas.height];
        twgl.bindFramebufferInfo(this.gl);
        this.ca.draw(viewSize);
        const a = document.createElement('a');
        a.href = canvas.toDataURL("image/png");
        a.download = name + '.png';
        a.click();
    }

};




//   param.benchmark = ()=>{
//     $('#log').insertAdjacentHTML('afterbegin', ca.benchmark());
//   }
//   gui.add(param, 'benchmark');

//   function render() {
//     if (param.active) {
//       ca.step();
//     }

//     const dpr = window.devicePixelRatio || 1;
//     canvas.width = Math.round(canvas.clientWidth * dpr);
//     canvas.height = Math.round(canvas.clientHeight * dpr);      
//     const viewSize = [canvas.clientWidth, canvas.clientHeight];

//     if (gesture && gesture.sonic) {
//       const [x, y] = gesture.prevPos;
//       const state = ca.peek(x, y, viewSize);
//       sonic.play(state);
//     } else {
//       sonic.stop();
//     }

//     twgl.bindFramebufferInfo(gl);
//     ca.draw(viewSize, 'color');
//     sonic.draw(viewSize);
//     // if (lastMousePos) {
//     //   const d=200;
//     //   gl.viewport(0, 0, 500*dpr, 32*dpr);
//     //   ca.draw(viewSize, 'sonic');
//     // }
//     requestAnimationFrame(render);
//   }

//   requestAnimationFrame(render);
// })