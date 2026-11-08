import * as T from 'three';

export function createExecutiveAvatarModel(variant) {
  const woman = variant !== 'man';
  const figure = new T.Group();
  const head = new T.Group();
  const bust = new T.Group();
  head.position.y = .30;
  figure.add(head,bust);

  const material = (color,roughness=.68, extra={}) => new T.MeshStandardMaterial({color,roughness,...extra});
  const skin = material(woman ? 0xe6a782 : 0xc99170,.70);
  const faceMaterial = material(0xffffff,.79,{vertexColors:true,side:T.DoubleSide});
  const skinMain = new T.Color(woman ? 0xe8ad8b : 0xc99170);
  const blush = new T.Color(woman ? 0xd47770 : 0xb36b5d);
  const hair = material(woman ? 0x2c2024 : 0x262022,.42,{side:T.DoubleSide});
  const strand = material(woman ? 0x503637 : 0x594038,.48,{side:T.DoubleSide});
  const darkerStrand = material(hair.color.clone().lerp(strand.color,.50),.47,{side:T.DoubleSide});
  const shirt = material(woman ? 0x202f4a : 0x233651,.86,{side:T.DoubleSide});
  const collar = material(woman ? 0x344863 : 0x405c83,.83,{side:T.DoubleSide});
  const seam = material(shirt.color.clone().multiplyScalar(.62),.87,{side:T.DoubleSide});
  const gear = material(0x1c222b,.39,{metalness:.16});
  const cushion = material(0x141823,.89);
  const metal = material(woman ? 0xc4a37a : 0xb2a287,.39,{metalness:.43});
  const glasses = material(woman ? 0x373041 : 0x2a272d,.34,{metalness:.22});
  const blazerLapel = material(woman ? 0x2c3e5d : 0x344c6e,.87,{side:T.DoubleSide});
  const blouse = material(woman ? 0xeadbcb : 0xe8edf0,.94,{side:T.DoubleSide});
  const white = material(0xfff1e6,.46);
  const irisRim = material(0x37201b,.49);
  const iris = material(0x8f4327,.38);
  const irisGold = material(0xa96232,.43);
  const pupil = material(0x181016,.24);
  const shine = new T.MeshBasicMaterial({color:0xfffbf4});
  const lash = material(0x422728,.77);
  const lip = material(woman ? 0xbc6255 : 0xa26452,.59,{side:T.DoubleSide});
  const lipLower = material(woman ? 0xd58473 : 0xb97862,.66,{side:T.DoubleSide});
  const mouthDark = material(0x47242d,.89,{side:T.DoubleSide});

  const v = (x,y,z) => new T.Vector3(x,y,z);
  const sphere = new T.SphereGeometry(1,40,28);
  function add(parent, geo, mat, x=0,y=0,z=0) {
    const mesh = new T.Mesh(geo,mat);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  }
  function ell(parent,mat,x,y,z,sx,sy,sz) {
    const mesh = add(parent,sphere,mat,x,y,z);
    mesh.scale.set(sx,sy,sz);
    return mesh;
  }
  function tube(parent,mat,points,radius,closed=false) {
    const path = new T.CatmullRomCurve3(points,closed);
    return add(parent,new T.TubeGeometry(path,Math.max(20,points.length*3),radius,8,closed),mat);
  }
  function sheet(parent,mat, rows, columns, point, vertexColor) {
    const pos = [], ids = [], colors = [];
    for(let j=0;j<=rows;j++) {
      for(let i=0;i<=columns;i++){
        const p = point(i/columns,j/rows);
        pos.push(p.x,p.y,p.z);
        if(vertexColor){ const c=vertexColor(p); colors.push(c.r,c.g,c.b); }
        if(i<columns && j<rows){const a=j*(columns+1)+i,b=a+columns+1;ids.push(a,a+1,b,a+1,b+1,b);}
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    if(vertexColor) g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    g.setIndex(ids);g.computeVertexNormals();
    return add(parent,g,mat);
  }
  const TAU=Math.PI*2;
  function contour(rows,t) {
    const y=T.MathUtils.lerp(rows[0][0],rows.at(-1)[0],t);
    const last=rows.length-1;
    let i=0;
    while(i<last-1 && y>rows[i+1][0]) i++;
    const previous=rows[Math.max(0,i-1)], next=rows[Math.min(last,i+2)];
    const [a,b]=[rows[i],rows[i+1]];
    const span=b[0]-a[0], f=(y-a[0])/span, f2=f*f, f3=f2*f;
    return a.map((value,k)=>{
      if(k===0)return y;
      const ma=(b[k]-previous[k])/(b[0]-previous[0]);
      const mb=(next[k]-a[k])/(next[0]-a[0]);
      return (2*f3-3*f2+1)*value+(f3-2*f2+f)*span*ma+(-2*f3+3*f2)*b[k]+(f3-f2)*span*mb;
    });
  }

  const faceRows = woman ? [[-.685,.025,.07,.05],[-.653,.20,.27,.055],[-.59,.36,.39,.057],
    [-.49,.46,.478,.05],[-.35,.54,.54,.048],[-.16,.61,.565,.041],[.04,.64,.565,.04],
    [.24,.627,.568,.035],[.43,.58,.55,.022],[.60,.49,.48,.002],[.745,.31,.32,-.015],[.823,.012,.018,-.025]]
    : [[-.695,.04,.10,.065],[-.669,.244,.313,.066],[-.615,.378,.43,.06],
    [-.53,.473,.492,.046],[-.38,.553,.54,.035],[-.18,.60,.558,.034],[.04,.625,.561,.034],
    [.24,.621,.561,.029],[.43,.578,.544,.012],[.60,.497,.470,-.001],[.745,.309,.31,-.018],[.823,.012,.018,-.026]];

  function facePoint(a,t) {
    const [y,w,d,center]=contour(faceRows,t);
    const x=Math.sin(a), front=Math.cos(a);
    const z=front>0 ? Math.pow(front,.67)*d+center : front*d+center;
    const nose= .17*Math.exp(-((x/.18)**2)-(((y+.11)/.17)**2))*Math.max(0,front)**8;
    const muzzle= .036*Math.exp(-((x/.47)**2)-(((y+.35)/.15)**2))*Math.max(0,front)**8;
    return v(x*w,y,z+nose+muzzle);
  }
  function faceSurface(x,y) {
    const t=(y-faceRows[0][0])/(faceRows.at(-1)[0]-faceRows[0][0]);
    const [,width]=contour(faceRows,t);
    return facePoint(Math.asin(T.MathUtils.clamp(x/width,-1,1)),t).z;
  }
  sheet(head,faceMaterial,85,96,(u,t)=>facePoint(u*TAU,t),p=>{
    const tint=(woman ? .47 : .24)*Math.exp(-(((Math.abs(p.x)-.40)/.15)**2)-(((p.y+.165)/.13)**2))*T.MathUtils.smoothstep(p.z,.10,.50);
    return skinMain.clone().lerp(blush,tint);
  });
  ell(bust,skin,0,-.40,-.02,woman ? .224 : .256,.397,woman ? .222 : .228);
  for(const side of [-1,1]){
    const ear=ell(head,skin,side*.625,-.10,-.015,.116,.175,.102);
    ear.rotation.z=side*.15;
  }

  const bodyProfile = woman ? [[-1.19,.94,.43],[-.99,.942,.455],[-.82,.87,.415],[-.69,.72,.344],[-.56,.52,.278],[-.49,.32,.227],[-.40,.228,.205]]
    : [[-1.19,1.05,.43],[-.99,1.052,.455],[-.82,.98,.415],[-.69,.82,.344],[-.56,.57,.278],[-.49,.34,.227],[-.40,.25,.205]];
  sheet(bust,shirt,66,84,(u,t)=>{
    const [y,w,d]=contour(bodyProfile,t);
    return v(Math.sin(u*TAU)*w,y,Math.cos(u*TAU)*d-.025);
  });

  // Surface panels follow the contour of the jacket through the shoulders and chest.
  function onChest(x,y,offset) {
    const t=(y-bodyProfile[0][0])/(bodyProfile.at(-1)[0]-bodyProfile[0][0]);
    const [,w,d]=contour(bodyProfile,T.MathUtils.clamp(t,0,1));
    return v(x,y,d*Math.sqrt(Math.max(0,1-(x/w)**2))-.025+offset);
  }

  if (woman) {

    sheet(bust,blouse,28,34,(u,t)=>{
      const x=(2*u-1)*T.MathUtils.lerp(.214,.030,t);
      const y=T.MathUtils.lerp(-.438-.115*Math.cos((2*u-1)*Math.PI/2),-1.19,t);
      return onChest(x,y,.019);
    });
    const pin=onChest(-.265,-.716,.060);
    ell(bust,metal,pin.x,pin.y,pin.z,.021,.021,.012);
    const pocket=[[-.53,-.824],[-.455,-.81],[-.366,-.796]];
    tube(bust,seam,pocket.map(([x,y])=>onChest(x,y,.012)),.008);

  } else {

    sheet(bust,blouse,28,34,(u,t)=>{
      const x=(2*u-1)*T.MathUtils.lerp(.21,.106,t);
      const y=T.MathUtils.lerp(-.45-.070*Math.cos((2*u-1)*Math.PI/2),-1.18,t);
      return onChest(x,y,.019);
    });
    const tie=material(0x783343,.82,{side:T.DoubleSide});
    const tieProfile=[[-1.19,.058],[-.92,.052],[-.75,.035],[-.675,.031],[-.635,.046],[-.605,.053],[-.58,.044],[-.575,.030]];
    sheet(bust,tie,42,12,(u,t)=>{
      const [y,width]=contour(tieProfile,t);
      return onChest((2*u-1)*width,y,.052+.011*Math.sin(u*Math.PI));
    });

  }

  for (const side of [-1,1]) {
    if (!woman) {

      const shirtProfile=[[-.689,.091,.096],[-.61,.060,.182],[-.536,.014,.192],[-.479,.172,.203]];
      sheet(bust,blouse,28,12,(u,t)=>{
        const [y,inside,outside]=contour(shirtProfile,t);
        return onChest(side*T.MathUtils.lerp(inside,outside,u),y,.037+.014*Math.sin(u*Math.PI));
      });

    }

    const shoulder=[[-.64,.49],[-.69,.65],[-.77,.78]];
    tube(bust,seam,shoulder.map(([y,x])=>onChest(x*side,y,.010)),.008);

    const rows=woman ? [[-1.19,.015,.065],[-.97,.080,.150],[-.81,.109,.225],[-.716,.137,.291],
      [-.67,.145,.316],[-.635,.154,.268],[-.605,.166,.281],[-.524,.180,.252],[-.457,.189,.211]]
      : [[-1.19,.084,.124],[-.97,.104,.177],[-.81,.130,.252],[-.716,.145,.322],
      [-.67,.157,.342],[-.635,.167,.292],[-.605,.173,.304],[-.524,.184,.262],[-.457,.194,.207]];
    sheet(bust,blazerLapel,48,18,(u,t)=>{
      const [y,inside,outside]=contour(rows,t);
      return onChest(side*T.MathUtils.lerp(inside,outside,u),y,.028+.015*Math.sin(u*Math.PI));
    });
    const edge=Array.from({length:49},(_,i)=>{
      const [y,,outside]=contour(rows,i/48);
      return onChest(side*outside,y,.030);
    });
    tube(bust,collar,edge,.003);
  }

  const eyes = [];
  const gazes = [];
  const brows = [];
  for(const side of [-1,1]) {
    const eye = new T.Group();
    eye.position.set(side*(woman ? .236 : .222),woman ? .079 : .074,woman ? .545 : .527);
    eye.rotation.y=side*.16;
    head.add(eye);
    eyes.push(eye);
    ell(eye,white,0,0,0,.181,.149,.087);
    const gaze=new T.Group();
    eye.add(gaze);
    gaze.scale.set(.77,woman ? .96 : .84,woman ? 1 : .72);
    gazes.push(gaze);
    ell(gaze,irisRim,-side*.009,-.005,.074,.103,.114,.038);
    ell(gaze,iris,-side*.009,-.003,.095,.085,.097,.031);
    ell(gaze,irisGold,-side*.009,-.024,.106,.068,.069,.026);
    ell(gaze,pupil,-side*.012,.006,.118,.054,.071,.027);
    ell(gaze,shine,-.037,.048,.143,.026,.024,.013);
    ell(gaze,shine,.021,-.035,.144,.012,.011,.007);
    const upper=[];
    for(let i=0;i<=22;i++){
      const a=Math.PI*i/22;
      upper.push(v(Math.cos(a)*.175, Math.sin(a)*.148+.004,.023+.012*Math.sin(a)));
    }
    tube(eye,lash,upper,.011);
    for(let j=0;woman && j<3;j++){
      const x=side*(.135+j*.012),y=.090-j*.016;
      tube(eye,lash,[v(x,y,.037),v(x+side*.031,y+.016,.05),v(x+side*.043,y+.038,.045)],.005);
    }
    const brow = new T.Group();
    brow.userData.restY=woman ? .269 : .275;
    brow.position.set(side*(woman ? .237 : .227),brow.userData.restY,woman ? .548 : .542);
    brow.scale.y=.76;
    head.add(brow);
    brows.push(brow);
    tube(brow,darkerStrand,[v(-side*.14,-.022,0),v(-side*.09,.011,.01),v(side*.003,.026,.012),v(side*.097,.008,0),v(side*.152,-.018,-.035)],woman ? .026 : .031);
  }

  const tailoredMouth=new T.Group();
  head.add(tailoredMouth);
  const smile=u=>.045*(2*u-1)**2-.019;
  const wave=u=>Math.sin(Math.PI*u)**.82;
  const mouthWidth=woman ? .173 : .189, mouthY=-.389, mouthSegments=32;
  const topEdge=(u,open)=>mouthY+smile(u)+.018*open*wave(u);
  const bottomEdge=(u,open)=>topEdge(u,open)-(.006+.092*open)*wave(u);
  const mouthSurfaces=[
    { mat:lip, top:(u,o)=>topEdge(u,o)+((woman ? .019 : .012)+.007*Math.sin(Math.PI*u*3))*wave(u), bottom:topEdge, offset:.011 },
    { mat:mouthDark, top:topEdge, bottom:bottomEdge, offset:.009 },
    { mat:lipLower, top:bottomEdge, bottom:(u,o)=>bottomEdge(u,o)-(woman ? .029 : .023)*wave(u), offset:.012 },
    { mat:white, top:(u,o)=>topEdge(u,o)-.004*wave(u),
      bottom:(u,o)=>topEdge(u,o)-Math.min(.020,.060*o)*wave(u), offset:.014, teeth:true },
  ];
  for(const surface of mouthSurfaces){
    surface.mesh=sheet(tailoredMouth,surface.mat,2,mouthSegments,(u,t)=>v(u,t,0));
    surface.mesh.frustumCulled=false;
  }
  let lastMouthPose=-1;
  function poseTailoredMouth(open){
    if(Math.abs(lastMouthPose-open)<.005)return;
    lastMouthPose=open;
    for(const {mesh,top,bottom,offset,teeth} of mouthSurfaces){
      mesh.visible=!teeth || open>.35;
      if(!mesh.visible)continue;
      const g=mesh.geometry, positions=g.attributes.position;
      for(let j=0;j<=2;j++){
        for(let i=0;i<=mouthSegments;i++){
          const u=i/mouthSegments;
          const x=(2*u-1)*mouthWidth*(teeth?.68:1)*(1-.10*open);
          const y=T.MathUtils.lerp(bottom(u,open),top(u,open),j/2);
          positions.setXYZ(j*(mouthSegments+1)+i,x,y,faceSurface(x,y)+offset);
        }
      }
      positions.needsUpdate=true;
      g.computeVertexNormals();
    }
  }

  function lock(parent,mat,coords,width,depth) {
    const path = new T.CatmullRomCurve3(coords.map(c=>v(...c)));
    return sheet(parent,mat,34,16,(u,t)=>{
      const p=path.getPoint(t),dir=path.getTangent(t);
      const sideways=v(dir.y,-dir.x,0).normalize();
      const front=new T.Vector3().crossVectors(dir,sideways).normalize();
      const taper=Math.max(.018,Math.sin(Math.PI*t)**.62*(1-.24*t));
      return p.addScaledVector(sideways,Math.cos(u*TAU)*width*taper).addScaledVector(front,Math.sin(u*TAU)*depth*taper);
    });
  }

  if (woman) {

    // Closed cap follows the forehead and extends into the nape.
    sheet(head,hair,54,108,(u,t)=>{
      const a=u*TAU, front=(1+Math.cos(a))/2;
      const limit=2.04-.79*front+.25*Math.sin(a)*front;
      const polar=.004+(limit-.004)*t;
      return v(.711*Math.sin(polar)*Math.sin(a),.077+.828*Math.cos(polar),-.055+.681*Math.sin(polar)*Math.cos(a));
    });
    lock(head,hair,[[.31,.835,.22],[.13,.769,.40],[-.18,.652,.493],[-.44,.48,.489],[-.588,.282,.361],[-.653,.08,.21]],.154,.039);
    lock(head,hair,[[.34,.815,.225],[.47,.65,.371],[.574,.45,.416],[.646,.22,.323],[.679,-.09,.17]],.113,.042);
    for(let i=0;i<10;i++){
      const q=i/9;
      lock(head,i%4===0?strand:darkerStrand,
        [[.30,.836-.037*q,.252],[.04,.800-.069*q,.436],[-.255,.675-.103*q,.514],
          [-.465,.53-.108*q,.497],[-.595,.331-.077*q,.376],[-.647,.12-.04*q,.22]],.0045,.003);
    }
    for(const side of [-1,1]) {
      lock(head,hair,[[side*.46,.67,-.33],[side*.626,.37,-.29],[side*.656,-.035,-.23],
        [side*.603,-.38,-.155],[side*.497,-.64,-.09]],.193,.202);
      lock(head,darkerStrand,[[side*.51,.58,-.36],[side*.65,.27,-.32],[side*.717,-.04,-.17],
        [side*.661,-.35,-.045],[side*.506,-.62,-.012]],.085,.071);
    }

  } else {

    sheet(head,hair,48,96,(u,t)=>{
      const a=u*TAU, forward=(1+Math.cos(a))/2;
      const limit=1.94-.96*forward+.23*Math.abs(Math.sin(a))**2;
      const polar=T.MathUtils.lerp(.004,limit,t);
      return v(.671*Math.sin(polar)*Math.sin(a),.108+.762*Math.cos(polar),-.046+.652*Math.sin(polar)*Math.cos(a));
    });
    lock(head,hair,[[.405,.693,.312],[.244,.805,.368],[-.078,.794,.437],[-.383,.665,.439],[-.526,.476,.327]],.130,.068);
    lock(head,hair,[[.279,.811,.315],[.434,.723,.364],[.556,.526,.376],[.611,.331,.253]],.084,.051);
    for(let i=0;i<6;i++){
      const t=i/5;
      lock(head,i%3===0?strand:darkerStrand,[[.34,.781-.032*t,.347],[.094,.843-.071*t,.433],
        [-.201,.775-.075*t,.505],[-.411,.645-.055*t,.458],[-.532,.481-.026*t,.348]],.009,.006);
    }

  }

  const arc=[];
  for(let i=0;i<=36;i++){
    const a=Math.PI*i/36;
    arc.push(v(Math.cos(a)*.699,.07+Math.sin(a)*.821,-.006));
  }
  tube(head,gear,arc,.057);
  tube(head,metal,arc.map(p=>v(p.x*1.023,p.y+.023,p.z-.043)),.016);
  function cup(mat,x,radius,length){
    const piece=add(head,new T.CylinderGeometry(radius,radius*.96,length,48),mat,x,-.075,-.005);
    piece.rotation.z=Math.PI/2;
    piece.scale.z=.90;
    return piece;
  }
  for(const side of [-1,1]){
    cup(cushion,side*.649,.196,.115);
    cup(gear,side*.709,.201,.118);
    cup(metal,side*.773,.181,.025);
    cup(gear,side*.796,.154,.031);
    ell(head,gear,side*.811,-.074,-.006,.023,.125,.127);
  }
  tube(head,gear,[v(.773,-.15,.035),v(.743,-.261,.184),v(.586,-.354,.418),v(.39,-.359,.608)],.024);
  const mic=ell(head,cushion,.371,-.36,.622,.067,.035,.046);
  mic.rotation.z=.22;

  const eyewear=new T.Group();
  head.add(eyewear);
  eyewear.position.z=woman ? -.026 : -.068;
  for(const side of [-1,1]){
    const loop=[];
    for(let i=0;i<60;i++){
      const a=TAU*i/60, s=Math.sin(a), c=Math.cos(a);
      const x=side*.244+.213*Math.sign(c)*Math.abs(c)**.49;
      const y=.066+(woman ? .129 : .110)*Math.sign(s)*Math.abs(s)**.49;
      loop.push(v(x,y,.779-.135*Math.abs(x)));
    }
    tube(eyewear,glasses,loop,woman ? .011 : .012,true);
    tube(eyewear,glasses,[v(side*.445,.110,.716),v(side*.522,.127,.598),v(side*.623,.107,.263),v(side*.662,.051,.134)],.018);
    ell(eyewear,metal,side*.443,.105,.737,.024,.016,.014);
  }
  tube(eyewear,glasses,[v(-.045,.104,.773),v(0,.124,.784),v(.045,.104,.773)],.018);

  return { figure, head, bust, eyes, gazes, brows, poseMouth: poseTailoredMouth };
}
