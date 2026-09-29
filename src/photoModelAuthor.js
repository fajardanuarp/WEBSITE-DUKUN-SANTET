// Authoring-only utility: turn the supplied print into a curved, thin GLB.
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
export async function createPhotoModel(){
 const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/textures/woman-photo.png';});
 const source=document.createElement('canvas');source.width=image.width;source.height=image.height;const ctx=source.getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;let left=image.width,top=image.height,right=0,bottom=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4;if(pixels[i+3]>128 && pixels[i]+pixels[i+1]+pixels[i+2]>90){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 const textureCanvas=document.createElement('canvas');textureCanvas.width=640;textureCanvas.height=Math.round(640*(bottom-top+1)/(right-left+1));const tc=textureCanvas.getContext('2d');tc.fillStyle='#ddd3b9';tc.fillRect(0,0,textureCanvas.width,textureCanvas.height);tc.drawImage(image,left,top,right-left+1,bottom-top+1,0,0,textureCanvas.width,textureCanvas.height);
 const texture=new THREE.CanvasTexture(textureCanvas);texture.colorSpace=THREE.SRGBColorSpace;
 const h=1.6,w=h*textureCanvas.width/textureCanvas.height,depth=.006;
 const geometry=new THREE.BoxGeometry(w,h,depth,24,36,1);const pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,pos.getZ(i)+.065*(x/w)**2+.025*Math.sin(y/h*Math.PI)*x/w);}
 geometry.computeVertexNormals();
 const paper=new THREE.MeshStandardMaterial({color:'#d8cdb0',roughness:.95,metalness:0});
 const front=new THREE.MeshStandardMaterial({map:texture,roughness:.82,metalness:0});
 const mesh=new THREE.Mesh(geometry,[paper,paper,paper,paper,front,paper]);mesh.name='Foto Pelet — curved paper print';
 const glb=await new GLTFExporter().parseAsync(mesh,{binary:true});
 return {glb:Array.from(new Uint8Array(glb)),thumbnail:textureCanvas.toDataURL('image/png')};
}
