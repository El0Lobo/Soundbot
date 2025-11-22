const fs = require("fs");
const path = require("path");
const { GUILD_FILE } = require("./config");

let guilds = {};

function loadGuilds(){ try{ guilds = JSON.parse(fs.readFileSync(GUILD_FILE,"utf8")); }catch{ guilds = {}; } }
function saveGuilds(){
  fs.mkdirSync(path.dirname(GUILD_FILE), { recursive:true });
  fs.writeFileSync(GUILD_FILE, JSON.stringify(guilds,null,2),"utf8");
}

function getGuildConfig(guildId){
  loadGuilds();
  return guilds[guildId] || { defaultChannelId:null, volume:0.5 };
}
function setDefaultChannel(guildId, channelId){
  loadGuilds();
  guilds[guildId] = guilds[guildId] || {};
  guilds[guildId].defaultChannelId = channelId;
  saveGuilds();
}
function setVolume(guildId, volume){
  loadGuilds();
  guilds[guildId] = guilds[guildId] || {};
  guilds[guildId].volume = volume;
  saveGuilds();
}

module.exports = { getGuildConfig, setDefaultChannel, setVolume };
