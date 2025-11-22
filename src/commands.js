const { SlashCommandBuilder } = require("discord.js");

module.exports = [
  new SlashCommandBuilder()
    .setName("shout")
    .setDescription("Play a sound")
    .addStringOption(opt =>
      opt.setName("sound").setDescription("Sound to play").setRequired(true).setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName("mode").setDescription("queue or interrupt")
        .addChoices({name:"queue", value:"queue"}, {name:"interrupt", value:"interrupt"})
    ),
  new SlashCommandBuilder().setName("stop").setDescription("Stop playback and leave"),
  new SlashCommandBuilder().setName("skip").setDescription("Skip current sound"),
  new SlashCommandBuilder().setName("queue").setDescription("Show queued sounds"),
  // new SlashCommandBuilder()
  //   .setName("volume").setDescription("Set default volume for this server")
  //   .addNumberOption(opt => opt.setName("value").setDescription("0-1").setRequired(true).setMinValue(0).setMaxValue(1)),
  // new SlashCommandBuilder()
  //   .setName("set-default-channel").setDescription("Set default voice channel for web playback")
  //   .addChannelOption(opt => opt.setName("channel").setDescription("Voice channel").setRequired(true)),
  new SlashCommandBuilder()
    .setName("link").setDescription("Link your Discord user to the website")
    .addStringOption(opt => opt.setName("code").setDescription("6-digit code from website").setRequired(true)),
  new SlashCommandBuilder()
    .setName("tunnel")
    .setDescription("Show the current Cloudflare tunnel URL for the web UI"),
].map(c=>c.toJSON());
