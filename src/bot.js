// src/bot.js
const { Client, GatewayIntentBits, Events } = require("discord.js");
const { getSounds } = require("./sounds");
const {
  playSound,
  stopPlayback,
  skipCurrent,
  getQueue,
  startLoop,
  stopLoop,
  isLooping
} = require("./audioManager");
const { setDefaultChannel, setVolume, getGuildConfig } = require("./guildStore");
const { getUserConfig } = require("./userStore");
const { playYoutubeOnce } = require("./ytPlay");
const { getCurrentTunnel } = require("./tunnel");
const {
  LOOP_CHANNEL_NAME,
  LOOP_SOUND_ID,
  LOOP_VOLUME
} = require("./config");

const loopChannelName = (LOOP_CHANNEL_NAME || "").trim().toLowerCase();
function isLoopChannel(channel) {
  if (!loopChannelName) return false;
  const name = (channel?.name || "").trim().toLowerCase();
  return name === loopChannelName;
}

function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  const pendingCodes = { map: null };

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Clear guild-level commands so only global commands remain (avoids duplicate entries in "/")
    try {
      const results = await Promise.allSettled(
        client.guilds.cache.map(async (guild) => {
          await guild.commands.set([]);
          console.log(`[CMD] Cleared guild commands in ${guild.name} (${guild.id})`);
        })
      );
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) {
        console.warn(`[CMD] Failed clearing guild commands in ${failed.length} guild(s).`);
      }
    } catch (err) {
      console.warn("[CMD] Error while clearing guild commands:", err.message);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = getSounds()
        .filter(s =>
          s.title.toLowerCase().includes(focused) ||
          s.id.includes(focused) ||
          (s.tags || []).some(t => t.toLowerCase().includes(focused))
        )
        .slice(0, 25)
        .map(s => ({ name: `${s.title} (${s.category})`, value: s.id }));
      return interaction.respond(choices);
    }

    if (!interaction.isChatInputCommand()) return;
    const guild = interaction.guild;
    if (!guild) return;

    const member = await guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;

    if (interaction.commandName === "play") {
      const soundId = interaction.options.getString("sound", true);
      const volume = interaction.options.getNumber("volume", false);
      const mode = interaction.options.getString("mode", false) || "queue";

      if (!voiceChannel) {
        return interaction.reply({ content: "You must be in a voice channel.", ephemeral: true });
      }
      try {
        await playSound({
          guild,
          voiceChannel,
          soundId,
          mode,
          volumeOverride: volume ?? null,
          requestedBy: interaction.user.id
        });
        await interaction.reply(`Playing **${soundId}** (${mode}).`);
      } catch (e) {
        await interaction.reply({ content: e.message, ephemeral: true });
      }
    }

    if (interaction.commandName === "play-yt") {
      const url = interaction.options.getString("url", true);

      if (!voiceChannel) {
        return interaction.reply({ content: "You must be in a voice channel.", ephemeral: true });
      }
      await interaction.reply({ content: "Downloading + playing YouTube audio…", ephemeral: true });

      try {
        await playYoutubeOnce({
          guild,
          voiceChannel,
          url
        });
      } catch (e) {
        await interaction.followUp({ content: `YouTube play failed: ${e.message}`, ephemeral: true });
      }
    }

    if (interaction.commandName === "stop") {
      if (!voiceChannel) {
        return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      }
      const stopped = stopPlayback(guild.id, voiceChannel.id);
      if (!stopped) {
        return interaction.reply({ content: "Nothing is playing here.", ephemeral: true });
      }
      await interaction.reply("Stopped and left this channel.");
    }

    if (interaction.commandName === "skip") {
      if (!voiceChannel) {
        return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      }
      const skipped = skipCurrent(guild.id, voiceChannel.id);
      if (!skipped) {
        return interaction.reply({ content: "Nothing to skip.", ephemeral: true });
      }
      await interaction.reply("Skipped.");
    }

    if (interaction.commandName === "queue") {
      if (!voiceChannel) {
        return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      }
      const q = getQueue(guild.id, voiceChannel.id);
      if (!q.length) return interaction.reply("Queue is empty.");
      await interaction.reply("Queue:\n" + q.map((x,i)=>`${i+1}. ${x.soundId}`).join("\n"));
    }

    if (interaction.commandName === "tunnel") {
      const info = getCurrentTunnel();
      if (info?.url) {
        return interaction.reply(`Current tunnel URL:\n${info.url}`);
      }
      return interaction.reply({ content: "No active tunnel detected.", ephemeral: true });
    }

    if (interaction.commandName === "volume") {
      const v = interaction.options.getNumber("value", true);
      setVolume(guild.id, v);
      await interaction.reply(`Default volume set to ${v}.`);
    }

    if (interaction.commandName === "set-default-channel") {
      const ch = interaction.options.getChannel("channel", true);
      if (!ch.isVoiceBased()) {
        return interaction.reply({ content: "Pick a voice channel.", ephemeral: true });
      }
      setDefaultChannel(guild.id, ch.id);
      await interaction.reply(`Default voice channel set to **${ch.name}**.`);
    }

    if (interaction.commandName === "link") {
      const code = interaction.options.getString("code", true);
      if (!pendingCodes.map) {
        return interaction.reply({ content: "Pairing not enabled.", ephemeral: true });
      }
      const entry = pendingCodes.map.get(code);
      if (!entry || entry.expiresAt < Date.now()) {
        return interaction.reply({ content: "Code invalid or expired.", ephemeral: true });
      }
      entry.userId = interaction.user.id;
      entry.guildId = interaction.guildId;
      pendingCodes.map.set(code, entry);
      await interaction.reply({ content: "Linked! Return to the website.", ephemeral: true });
    }
  });

  // Intro / outro per channel queue
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      const userId = newState.id;
      const guild = newState.guild || oldState.guild;
      if (!guild) return;
      const joinedLoop = newState.channel && isLoopChannel(newState.channel);
      const leftLoop = oldState.channel && isLoopChannel(oldState.channel);

      // Joined a channel
      if (!oldState.channelId && newState.channelId) {
        const cfg = getUserConfig(userId);
        if (!cfg.intro || joinedLoop) return;
        const voiceChannel = newState.channel;
        if (!voiceChannel) return;

        await playSound({
          guild,
          voiceChannel,
          soundId: cfg.intro,
          mode: "queue",
          requestedBy: "intro"
        });
      }

      // Left a channel
      if (oldState.channelId && !newState.channelId) {
        const cfg = getUserConfig(userId);
        if (!cfg.outro || leftLoop) return;
        const voiceChannel = oldState.channel;
        if (!voiceChannel) return;

        await playSound({
          guild,
          voiceChannel,
          soundId: cfg.outro,
          mode: "queue",
          requestedBy: "outro"
        });
      }

      // Moved between channels: outro old, intro new
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const cfg = getUserConfig(userId);

        if (cfg.outro && oldState.channel && !isLoopChannel(oldState.channel)) {
          await playSound({
            guild,
            voiceChannel: oldState.channel,
            soundId: cfg.outro,
            mode: "queue",
            requestedBy: "outro"
          });
        }

        if (cfg.intro && newState.channel && !isLoopChannel(newState.channel)) {
          await playSound({
            guild,
            voiceChannel: newState.channel,
            soundId: cfg.intro,
            mode: "queue",
            requestedBy: "intro"
          });
        }
      }
    } catch (e) {
      console.error("[VOICE STATE INTRO/OUTRO ERROR]", e);
    }
  });

  // Register loop-on-join handler
  setupBot(client);

  return { client, pendingCodesRef: pendingCodes };
}

function setupBot(client) {
  // your other event handlers / slash command routing stays as-is

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      const oldCh = oldState.channel;
      const newCh = newState.channel;

      const targetName = (LOOP_CHANNEL_NAME || "").toLowerCase().trim();
      if (!targetName) return;

      // helper to check a channel name match
      const isTarget = (ch) =>
        ch && ch.name && ch.name.toLowerCase().trim() === targetName;

      const joinedTarget = (!oldCh && newCh && isTarget(newCh)) ||
                           (oldCh && newCh && oldCh.id !== newCh.id && isTarget(newCh));

      const leftTarget = (oldCh && isTarget(oldCh) && (!newCh || newCh.id !== oldCh.id));

      // If someone joined the target channel:
      if (joinedTarget) {
        // ignore bot itself
        if (newState.member?.user?.bot) return;

        const channel = newCh;
        const humans = channel.members.filter(m => !m.user.bot);

        if (humans.size > 0 && !isLooping(guild.id, channel.id)) {
          const cfg = getGuildConfig(guild.id);
          const vol = cfg.volume ?? LOOP_VOLUME ?? 0.5;
          console.log("[LOOP] starting in", channel.name, "sound:", LOOP_SOUND_ID, "vol:", vol);
          await startLoop({
            guild,
            voiceChannel: channel,
            soundId: LOOP_SOUND_ID,
            volume: vol
          });
        }
      }

      // If someone left the target channel:
      if (leftTarget) {
        const channel = oldCh;
        if (!channel) return;

        const humans = channel.members.filter(m => !m.user.bot);

        if (humans.size === 0) {
          console.log("[LOOP] stopping in", channel.name);
          stopLoop(guild.id, channel.id);
        }
      }

    } catch (e) {
      console.log("[LOOP] voiceStateUpdate error:", e.message);
    }
  });
}



module.exports = { createBot };
