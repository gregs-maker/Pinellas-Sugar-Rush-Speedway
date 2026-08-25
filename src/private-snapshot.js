import crypto from "node:crypto";
import fs from "node:fs/promises";

function keyFromSecret(secret){
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export async function savePrivateSnapshot(snapshot,{plainPath="data/private-weekly.json",encPath="data/private-weekly.enc"}={}){
  const secret=process.env.SPEEDWAY_SNAPSHOT_KEY;
  if(!secret){
    await fs.writeFile(plainPath,JSON.stringify(snapshot,null,2)+"\n");
    return {mode:"plaintext-local",path:plainPath};
  }
  const key=keyFromSecret(secret);
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const plaintext=Buffer.from(JSON.stringify(snapshot),"utf8");
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  const envelope={
    v:1,
    alg:"AES-256-GCM",
    iv:iv.toString("base64"),
    tag:tag.toString("base64"),
    data:ciphertext.toString("base64")
  };
  await fs.writeFile(encPath,JSON.stringify(envelope)+"\n");
  return {mode:"encrypted",path:encPath};
}

export async function loadPrivateSnapshot({plainPath="data/private-weekly.json",encPath="data/private-weekly.enc"}={}){
  const secret=process.env.SPEEDWAY_SNAPSHOT_KEY;
  if(secret){
    const envelope=JSON.parse(await fs.readFile(encPath,"utf8"));
    const key=keyFromSecret(secret);
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
    const plain=Buffer.concat([
      decipher.update(Buffer.from(envelope.data,"base64")),
      decipher.final()
    ]);
    return JSON.parse(plain.toString("utf8"));
  }
  return JSON.parse(await fs.readFile(plainPath,"utf8"));
}
