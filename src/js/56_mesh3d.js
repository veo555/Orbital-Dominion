/* =========================================================================
   MESH3D (v5) — a tiny bake-time software rasteriser. Units and buildings are described as compact meshes
   (box / tapered prism / cylinder / cone / dome / extruded polygon) and pre-rendered into sprites, the way classic RTS art was made.
   No WebGL, no assets, nothing runs per frame: a sprite is baked once per (type, faction, facing) and cached with an LRU.
   World axes: x east, y south (the ground plane, 1:1 with the terrain), z up. Oblique projection: screen y = y - K3*z,
   so every roof shows AND the south faces show, while footprints stay exactly one terrain tile per tile.
   Shading per pixel: key light from the north-west (the same one the cast shadows follow) + hemispheric ambient + specular
   + rim + a height term + a depth-buffer ambient-occlusion pass; 'emissive' materials are unlit and also written to a glow mask.
   ========================================================================= */
const K3=.62,L3=[-.5,-.6,.62],VN=Math.hypot(K3,1),V3=[0,K3/VN,1/VN];
{const n=Math.hypot(L3[0],L3[1],L3[2]);for(let i=0;i<3;i++)L3[i]/=n;}
const H3=(()=>{const h=[L3[0]+V3[0],L3[1]+V3[1],L3[2]+V3[2]],n=Math.hypot(h[0],h[1],h[2]);return h.map(v=>v/n);})();
function hexRGB(h){const v=parseInt(h.slice(1),16);return[v>>16,(v>>8)&255,v&255];}
function nrm3(a,b,c){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,l=Math.hypot(x,y,z);return l<1e-9?[0,0,1]:[x/l,y/l,z/l];}
function Mesh3(){
  const T=[],MT=[],MI={};
  const B={t:T,mats:MT,
    m(hex,s,p,e){s=s===undefined?.3:s;p=p||24;e=e||0;const k=hex+s+'|'+p+e;return MI[k]!==undefined?MI[k]:(MI[k]=MT.push(hexRGB(hex).concat([s,p,e]))-1);},
    tri(a,b,c,mt,na,nb,nc){T.push({p:[a,b,c],n:[na||(na=nrm3(a,b,c)),nb||na,nc||na],m:mt});},
    quad(a,b,c,d,mt,ctr){let n=nrm3(a,b,c);const fx=(a[0]+c[0])/2-ctr[0],fy=(a[1]+c[1])/2-ctr[1],fz=(a[2]+c[2])/2-ctr[2];if(n[0]*fx+n[1]*fy+n[2]*fz<0)n=[-n[0],-n[1],-n[2]];B.tri(a,b,c,mt,n);B.tri(a,c,d,mt,n);},
    /* tapered prism: base w0 x d0, top w1 x d1 shifted by (ox,oy); w1=w0,d1=d0 is a box, w1=0 a ridge/pyramid */
    fr(x,y,z,w0,d0,w1,d1,h,mt,ox,oy){ox=ox||0;oy=oy||0;const ctr=[x+ox/2,y+oy/2,z+h/2],
        b=[[x-w0/2,y-d0/2,z],[x+w0/2,y-d0/2,z],[x+w0/2,y+d0/2,z],[x-w0/2,y+d0/2,z]],
        t=[[x+ox-w1/2,y+oy-d1/2,z+h],[x+ox+w1/2,y+oy-d1/2,z+h],[x+ox+w1/2,y+oy+d1/2,z+h],[x+ox-w1/2,y+oy+d1/2,z+h]];
      B.quad(t[0],t[1],t[2],t[3],mt,ctr);B.quad(b[0],b[1],b[2],b[3],mt,ctr);for(let i=0;i<4;i++){const j=(i+1)&3;B.quad(b[i],b[j],t[j],t[i],mt,ctr);}},
    box(x,y,z,w,d,h,mt){B.fr(x,y,z,w,d,w,d,h,mt);},
    /* cylinder / cone / frustum round: radii r0 (bottom) r1 (top), axis 'z' (default) | 'x' | 'y' (cap centre at x,y,z, extends +h along the axis) */
    cy(x,y,z,r0,r1,h,n,mt,ax){n=n||10;ax=ax||'z';
      const P=(u,v,w)=>ax==='z'?[x+u,y+v,z+w]:ax==='x'?[x+w,y+u,z+v]:[x+u,y+w,z+v],N=(u,v,w)=>ax==='z'?[u,v,w]:ax==='x'?[w,u,v]:[u,w,v];
      for(let i=0;i<n;i++){const a0=i/n*TAU,a1=(i+1)/n*TAU,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),sl=(r0-r1)/Math.max(h,1e-3);
        const nn=(c,s)=>{const l=Math.hypot(1,sl);return N(c/l,s/l,sl/l);};
        const A=P(r0*c0,r0*s0,0),Bq=P(r0*c1,r0*s1,0),C=P(r1*c1,r1*s1,h),D=P(r1*c0,r1*s0,h),n0=nn(c0,s0),n1=nn(c1,s1);
        B.tri(A,Bq,C,mt,n0,n1,n1);B.tri(A,C,D,mt,n0,n1,n0);
        if(r1>0)B.tri(P(0,0,h),D,C,mt,N(0,0,1));if(r0>0)B.tri(P(0,0,0),Bq,A,mt,N(0,0,-1));}},
    /* ellipsoid, or its upper half (dome) */
    sp(x,y,z,rx,ry,rz,n,mt,half){n=n||8;const L=half?n:2*n,lat0=half?0:-Math.PI/2,dl=(half?Math.PI/2:Math.PI)/L,
        pt=(i,j)=>{const th=lat0+i*dl,ph=j/(2*n)*TAU,ct=Math.cos(th);return{p:[x+rx*ct*Math.cos(ph),y+ry*ct*Math.sin(ph),z+rz*Math.sin(th)],n:(()=>{const a=ct*Math.cos(ph)/rx,b=ct*Math.sin(ph)/ry,c=Math.sin(th)/rz,l=Math.hypot(a,b,c);return[a/l,b/l,c/l];})()};};
      for(let i=0;i<L;i++)for(let j=0;j<2*n;j++){const a=pt(i,j),b=pt(i,j+1),c=pt(i+1,j+1),d=pt(i+1,j);B.tri(a.p,b.p,c.p,mt,a.n,b.n,c.n);B.tri(a.p,c.p,d.p,mt,a.n,c.n,d.n);}},
    /* extruded star-shaped polygon (flat [x,y,...]); top scaled by s about the centroid gives sloped sides */
    ex(pts,z,h,mt,s){s=s===undefined?1:s;const n=pts.length/2;let cx=0,cy=0;for(let i=0;i<n;i++){cx+=pts[i*2]/n;cy+=pts[i*2+1]/n;}
      const ctr=[cx,cy,z+h/2],top=i=>[cx+(pts[i*2]-cx)*s,cy+(pts[i*2+1]-cy)*s,z+h],bot=i=>[pts[i*2],pts[i*2+1],z];
      for(let i=0;i<n;i++){const j=(i+1)%n;B.quad(bot(i),bot(j),top(j),top(i),mt,ctr);B.tri([cx,cy,z+h],top(i),top(j),mt,[0,0,1]);}}
  };
  return B;
}
/* fills one triangle given screen coords; calls cb(index, w0, w1, w2) for every covered pixel centre */
function scanTri(x0,y0,x1,y1,x2,y2,W,H,cb){
  const ar=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);if(Math.abs(ar)<1e-6)return;const inv=1/ar;
  const ax=Math.max(0,Math.floor(Math.min(x0,x1,x2))),bx=Math.min(W-1,Math.ceil(Math.max(x0,x1,x2))),ay=Math.max(0,Math.floor(Math.min(y0,y1,y2))),by=Math.min(H-1,Math.ceil(Math.max(y0,y1,y2)));
  for(let py=ay;py<=by;py++)for(let px=ax;px<=bx;px++){const X=px+.5,Y=py+.5,
    w0=((x1-X)*(y2-Y)-(x2-X)*(y1-Y))*inv,w1=((x2-X)*(y0-Y)-(x0-X)*(y2-Y))*inv,w2=1-w0-w1;
    if(w0>=-1e-4&&w1>=-1e-4&&w2>=-1e-4)cb(py*W+px,w0,w1,w2);}
}
/* mesh bounds: [maxRadius, maxZ, minX, maxX, minY, maxY] in the ground plane */
function meshBounds(M){let r=0,z=0,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const t of M.t)for(const p of t.p){r=Math.max(r,Math.hypot(p[0],p[1]));z=Math.max(z,p[2]);x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}return[r,z,x0,x1,y0,y1];}
/* bakes the mesh turned by `yaw` into {cv, em, fp}: colour sprite, emissive glow mask (1/3 size) and ground footprint (shadow source).
   (ox, oy) = where the mesh origin lands in the W x H canvas, sc = bake pixels per world pixel. */
function bakeMesh(M,yaw,W,H,ox,oy,sc){
  const N=W*H,zb=new Float32Array(N).fill(-1e9),im=new ImageData(W,H),d=im.data,eb=new Uint8ClampedArray(N*4),cs=Math.cos(yaw),sn=Math.sin(yaw);let ne=0;
  const key=[1,.93,.8],hz=4/sc*2;
  for(const t of M.t){
    const P=[],Nn=[];for(let i=0;i<3;i++){const p=t.p[i],n=t.n[i];P.push([p[0]*cs-p[1]*sn,p[0]*sn+p[1]*cs,p[2]]);Nn.push([n[0]*cs-n[1]*sn,n[0]*sn+n[1]*cs,n[2]]);}
    const S=P.map(p=>[ox+p[0]*sc,oy+(p[1]-K3*p[2])*sc]),mt=M.mats[t.m],em=mt[5],sc0=mt[3],pw=mt[4];
    const D=P.map(p=>K3*p[1]+p[2]);
    scanTri(S[0][0],S[0][1],S[1][0],S[1][1],S[2][0],S[2][1],W,H,(i,a,b,c)=>{
      const dp=a*D[0]+b*D[1]+c*D[2];if(dp<=zb[i])return;zb[i]=dp;
      const o=i*4;let r,g,bl;eb[o+3]=0;
      if(em){r=Math.min(255,mt[0]*1.15+30);g=Math.min(255,mt[1]*1.15+30);bl=Math.min(255,mt[2]*1.15+30);eb[o]=r;eb[o+1]=g;eb[o+2]=bl;eb[o+3]=255;ne++;}
      else{
        let nx=a*Nn[0][0]+b*Nn[1][0]+c*Nn[2][0],ny=a*Nn[0][1]+b*Nn[1][1]+c*Nn[2][1],nz=a*Nn[0][2]+b*Nn[1][2]+c*Nn[2][2];const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
        const zw=a*P[0][2]+b*P[1][2]+c*P[2][2],ndl=Math.max(0,nx*L3[0]+ny*L3[1]+nz*L3[2]),sky=.5+.5*nz,zao=.7+.3*Math.min(1,zw/10),
          rim=Math.pow(1-Math.max(0,ny*V3[1]+nz*V3[2]),3),sp=ndl>0?Math.pow(Math.max(0,nx*H3[0]+ny*H3[1]+nz*H3[2]),pw)*sc0:0,
          ar=(.30+.26*sky)*zao,ag=(.33+.28*sky)*zao,ab=(.42+.34*sky)*zao;
        r=mt[0]*(ar+key[0]*ndl*.88)+sp*(110+.4*mt[0])+rim*30*(.4+ndl);g=mt[1]*(ag+key[1]*ndl*.88)+sp*(110+.4*mt[1])+rim*38*(.4+ndl);bl=mt[2]*(ab+key[2]*ndl*.88)+sp*(110+.4*mt[2])+rim*52*(.4+ndl);
      }
      d[o]=r>255?255:r;d[o+1]=g>255?255:g;d[o+2]=bl>255?255:bl;d[o+3]=255;});
  }
  /* ambient occlusion from the depth buffer: a pixel with nearer surfaces beside it (overhangs, turret bases, plate steps) is darkened; then a dark 1-px silhouette */
  const R=Math.max(2,Math.round(2.2*sc)),dx=[R,-R,0,0,R,-R,R,-R],dy=[0,0,R,-R,R,R,-R,-R],ao=new Float32Array(N);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,z=zb[i];if(z<-1e8)continue;let oc=0;
    for(let k=0;k<8;k++){const X=x+dx[k],Y=y+dy[k];if(X<0||Y<0||X>=W||Y>=H)continue;const zn=zb[Y*W+X];if(zn>-1e8&&zn>z+1.2)oc+=Math.min(1,(zn-z)/7);}
    ao[i]=oc/8;}
  const ow=Math.max(1,Math.round(sc*.5));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(zb[i]<-1e8)continue;const o=i*4;let k=eb[o+3]?1:1-.55*ao[i]*2;if(k<.5)k=.5;
    if(x<ow||y<ow||x>=W-ow||y>=H-ow||zb[i-ow]<-1e8||zb[i+ow]<-1e8||zb[i-ow*W]<-1e8||zb[i+ow*W]<-1e8)k*=.55;
    d[o]*=k;d[o+1]*=k;d[o+2]*=k;}
  const cv=mkCanvas(W,H);cv.getContext('2d').putImageData(im,0,0);
  const out={cv,fp:null};
  if(ne>3){const full=mkCanvas(W,H),fg=full.getContext('2d');fg.putImageData(new ImageData(eb,W,H),0,0);const em=mkCanvas(Math.ceil(W/3),Math.ceil(H/3));const eg=em.getContext('2d');eg.imageSmoothingEnabled=true;eg.drawImage(full,0,0,em.width,em.height);cv._em=em;}
  return out;
}
/* ground footprint (plan projection of every triangle, yaw-turned) as a black silhouette canvas; the shadow system blurs and offsets it */
function bakeFootprint(M,yaw,W,H,ox,oy,sc){
  const im=new ImageData(W,H),d=im.data,cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(const t of M.t){const S=t.p.map(p=>[ox+(p[0]*cs-p[1]*sn)*sc,oy+(p[0]*sn+p[1]*cs)*sc]);scanTri(S[0][0],S[0][1],S[1][0],S[1][1],S[2][0],S[2][1],W,H,i=>{d[i*4+3]=255;});}
  const c=mkCanvas(W,H);c.getContext('2d').putImageData(im,0,0);return c;
}
