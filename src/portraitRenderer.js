// Authoring utility: invoked only by scripts/render-portraits.mjs in Vite dev.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/examples/jsm/loaders/KTX2Loader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
export async function renderPortrait(id){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,1200);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1000/1200,.1,100);camera.position.set(0,0,5.9);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.add(new THREE.AmbientLight('#ead7c0',1.3));const key=new THREE.DirectionalLight('#fff1df',3);key.position.set(-3,4,5);scene.add(key);
 const draco=new DRACOLoader().setDecoderPath('/draco/');const ktx=new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx);
 const gltf=await loader.loadAsync('/props/'+id+'.glb');const object=gltf.scene;const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());object.position.sub(center);const group=new THREE.Group();group.add(object);group.scale.setScalar(2.75/Math.max(size.x,size.y,size.z));group.rotation.set(id==='tarot'?-.08:0,id==='tarot'?-.18:.15,id==='tarot'?-.15:-.15);scene.add(group);object.traverse(n=>{if(n.isMesh){if(!n.geometry.attributes.normal)n.geometry.computeVertexNormals();n.material.envMapIntensity=1.3;if(id==='tarot'){n.material.metalness=.12;n.material.roughness=.7;n.material.normalScale?.setScalar(.2);}}});renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');env.dispose();room.dispose();pmrem.dispose();draco.dispose();ktx.dispose();object.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose();}});renderer.dispose();return png;
}
