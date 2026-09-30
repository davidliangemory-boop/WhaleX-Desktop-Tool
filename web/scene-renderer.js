/* WhaleX native-resolution whale compositor. No dependencies or network calls.
   The original alpha sprite is sampled directly; no strip atlas or intermediate downscale. */
(() => {
  'use strict';
  const vertex = `attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
  const fragment = `
    precision highp float;
    uniform sampler2D image;
    uniform vec2 resolution, viewport, texel, pointer;
    uniform float time, strength, ratio;
    const float PI=3.14159265359;
    const float TAU=6.28318530718;
    mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
    vec4 over(vec4 a,vec4 b){return a+b*(1.-a.a);}
    vec4 light(vec3 color,float a){a=clamp(a,0.,.94);return vec4(color*a,a);}
    vec4 ring(vec2 p,vec2 size,float phase,bool front){
      vec2 q=rotate(-.15)*p;
      if(front&&q.y<0.)return vec4(0.);
      vec2 n=q/size;float a=atan(n.y,n.x);
      float dist=abs(length(n)-1.)/max(length(q/(size*size))/max(length(n),.0001),.0001);
      float trail=mod(phase-a+TAU,TAU);
      float energy=exp(-trail*4.8);
      float line=exp(-dist*dist/1.0)*(.08+energy*.7);
      float bloom=exp(-dist*dist/24.)*energy*.14;
      vec2 head=vec2(cos(phase),sin(phase))*size;
      float dotGlow=exp(-dot(q-head,q-head)/54.)*.36;
      float core=exp(-dot(q-head,q-head)/2.8)*.9;
      return light(mix(vec3(.38,.46,1.),vec3(.72,.93,1.),energy),line+bloom+dotGlow+core);
    }
    void main(){
      vec2 p=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)*viewport/resolution;
      float w=min(min(viewport.x*.82,viewport.y*1.5),630.);
      float h=w*ratio;
      vec2 base=vec2(viewport.x*.54,viewport.y*.34)+pointer*vec2(8.,4.);
      vec2 center=base+vec2(sin(time*.23)*17.,sin(time*.65)*9.)*strength;
      vec2 local=rotate(sin(time*.43)*.032*strength)*(p-center);
      vec2 uv=local/vec2(w,h)+vec2(.5,.526);
      float tail=pow(clamp(1.-uv.x,0.,1.),2.4);
      uv.y-=sin(time*1.18-uv.x*5.2)*tail*.073*strength;
      uv.x+=sin(time*.59-uv.y*3.)*tail*.005*strength;
      vec4 sampleColor=vec4(0.);
      if(uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.){
        sampleColor=texture2D(image,uv);
        vec3 neighbors=texture2D(image,uv+vec2(texel.x,0.)).rgb+texture2D(image,uv-vec2(texel.x,0.)).rgb
          +texture2D(image,uv+vec2(0.,texel.y)).rgb+texture2D(image,uv-vec2(0.,texel.y)).rgb;
        vec3 detail=clamp(sampleColor.rgb*1.28-neighbors*.07,0.,1.);
        float luma=dot(detail,vec3(.2126,.7152,.0722));
        float ripple=pow(max(0.,sin(uv.x*24.+uv.y*17.-time*.8)),12.);
        float sheen=ripple*.055*smoothstep(.08,.58,luma);
        detail+=vec3(.34,.67,.72)*sheen;
        sampleColor=vec4(clamp(detail,0.,1.)*sampleColor.a,sampleColor.a);
      }
      vec2 orbitPoint=p-base-vec2(0.,27.);
      vec2 orbitSize=vec2(w*.61,h*.31);
      vec4 back=ring(orbitPoint,orbitSize,time*.33,false);
      float ambient=exp(-dot((p-center)/vec2(w*.55,h*.95),(p-center)/vec2(w*.55,h*.95))*3.)*.055;
      back=over(back,light(vec3(.14,.41,.9),ambient));
      vec4 result=over(sampleColor,back);
      result=over(ring(orbitPoint,orbitSize,time*.33,true),result);
      // Fine wake, localized behind the tail instead of an overall bloom filter.
      if(p.x<base.x-w*.26&&p.x>base.x-w*.34-120.&&abs(p.y-base.y+h*.08)<30.)for(int i=0;i<20;i++){
        float seed=float(i),age=fract(time*.105+seed/20.);
        vec2 point=base+vec2(-w*.34-age*100.,-h*.08+sin(seed*2.39+time*.8)*(7.+age*18.));
        float d=length(p-point),a=exp(-d*d/(1.+age*3.))*(1.-age)*.62;
        result=over(light(vec3(.47,.86,1.),a),result);
      }
      gl_FragColor=result;
    }`;
  const backdropFragment = `
    precision highp float;
    uniform sampler2D image;
    uniform vec2 resolution,viewport,texel,pointer;
    uniform float time,strength;
    float noise(vec3 p){return sin(p.x+sin(p.y*1.21+p.z))*.5+.5;}
    vec3 sphere(vec2 p,vec2 center,float radius,float horizon,float speed){
      vec2 n=(p-center)/radius;float r2=dot(n,n);
      if(r2>=1.||p.y>horizon)return vec3(0.);
      float z=sqrt(max(0.,1.-r2));
      float edge=smoothstep(0.,.22,z)*(1.-smoothstep(horizon-18.,horizon,p.y));
      float turn=sin(time*speed)*.12*strength;
      float x=n.x*cos(turn)+z*sin(turn);
      float flow=(x-n.x)*radius*edge;
      // Advection on a spherical field: cloud light bends with the hemisphere.
      vec3 normal=vec3(n,z);
      float cloud=noise(normal*9.+vec3(time*.045*speed/.04,0.,0.));
      cloud*=noise(normal*23.+vec3(time*.073,1.,2.));
      cloud=pow(cloud,3.5)*edge*(.3+.7*z);
      return vec3(flow,edge,cloud);
    }
    void main(){
      vec2 screen=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)*viewport/resolution;
      float scale=max(viewport.x/1672.,viewport.y/941.);
      float anchor=viewport.x<=760.?.44:.5;
      vec2 p=(screen-vec2((viewport.x-1672.*scale)*anchor,0.))/scale;
      vec3 planet=sphere(p,vec2(870.,250.),194.,263.,.065);
      planet+=sphere(p,vec2(308.,281.),134.,362.,-.045);
      planet+=sphere(p,vec2(331.,86.),14.,103.,.055);
      planet+=sphere(p,vec2(1314.,297.),20.,320.,-.035);
      vec2 samplePoint=p+vec2(planet.x,0.);
      // Distant nebulae flow on a very slow separate plane, outside the planets.
      float sky=1.-smoothstep(260.,490.,p.y);
      float flow=sky*(1.-planet.y);
      samplePoint+=vec2(sin(p.y*.013+time*.08),cos(p.x*.009-time*.06))*.85*flow*strength;
      vec2 uv=samplePoint/vec2(1672.,941.);
      vec3 color=texture2D(image,uv).rgb;
      vec3 neighbors=(texture2D(image,uv+vec2(texel.x,0.)).rgb+texture2D(image,uv-vec2(texel.x,0.)).rgb
        +texture2D(image,uv+vec2(0.,texel.y)).rgb+texture2D(image,uv-vec2(0.,texel.y)).rgb)*.25;
      color=clamp(color+(color-neighbors)*.18,0.,1.);
      color+=vec3(.08,.24,.34)*planet.z*.33;
      gl_FragColor=vec4(color,1.);
    }`;
  function create(type='whale'){
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if(!gl)return null;
    let program,buffer,texture,uniforms={},source=null,lost=false,disposed=false,last=null;
    function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message);}return s;}
    function init(){
      const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,type==='backdrop'?backdropFragment:fragment);
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Whale compositor unavailable');
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const location=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      for(const name of ['resolution','viewport','texel','pointer','time','strength','ratio','image'])uniforms[name]=gl.getUniformLocation(program,name);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.uniform1i(uniforms.image,0);gl.clearColor(0,0,0,0);
    }
    function setSprite(image){source=image;if(lost||disposed)return;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
    function draw(w,h,dpr,t,pointer,strength){
      last=[w,h,dpr,t,pointer,strength];if(lost||disposed||!source)return;
      gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
      gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform2f(uniforms.viewport,w,h);
      gl.uniform2f(uniforms.texel,1/source.naturalWidth,1/source.naturalHeight);gl.uniform2f(uniforms.pointer,pointer.x,pointer.y);
      gl.uniform1f(uniforms.time,t);gl.uniform1f(uniforms.strength,strength);gl.uniform1f(uniforms.ratio,source.naturalHeight/source.naturalWidth);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function contextLost(e){e.preventDefault();lost=true;canvas.style.visibility='hidden';if(type==='whale')document.body.classList.add('whale-fallback');}
    function contextRestored(){if(disposed)return;try{init();lost=false;if(source)setSprite(source);if(last)draw(...last);canvas.style.visibility='';if(type==='whale')document.body.classList.remove('whale-fallback');}catch{lost=true;}}
    try{init();}catch(error){console.warn('WhaleX HD: Canvas fallback:',error.message);gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
    canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
    return {canvas,setSprite,draw,inspect:()=>({renderer:'webgl',contextLost:lost,texture:source?[source.naturalWidth,source.naturalHeight]:null}),dispose(){disposed=true;canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);if(!lost){gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);}source=last=null;}};
  }
  window.WhaleXWhaleRenderer={create};
  window.WhaleXBackdropRenderer={create:()=>create('backdrop')};
})();
