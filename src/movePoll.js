const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder
} = require("discord.js");
const { LOOP_CHANNEL_NAME } = require("./config");

function findLoopChannel(guild) {
  const targetName = (LOOP_CHANNEL_NAME || "").toLowerCase().trim();
  if (!targetName) return null;

  return guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildVoice &&
      ch.name &&
      ch.name.toLowerCase().trim() === targetName
  );
}

function pickRandomGif() {
  const idx = Math.floor(Math.random() * 6) + 1; // 1–6 inclusive
  return path.join(__dirname, "..", "public", "gifs", `${idx}.gif`);
}

async function startMovePoll({ guild, requesterId, targetId }) {
  const requester = await guild.members.fetch(requesterId);
  const target = await guild.members.fetch(targetId);

  const vc = requester.voice?.channel;
  if (!vc) throw new Error("You are not in a voice channel.");

  if (target.voice?.channelId !== vc.id) {
    throw new Error("Target is not in your voice channel.");
  }

  const loopChannel = findLoopChannel(guild);
  if (!loopChannel) {
    throw new Error("Loop channel not found. Check LOOP_CHANNEL_NAME.");
  }

  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error("Bot lacks Move Members permission.");
  }

  if (target.roles.highest.position >= me.roles.highest.position) {
    throw new Error("Bot cannot move this member due to role hierarchy.");
  }

  const eligibleVoters = vc.members
    .filter(m => !m.user.bot)
    .map(m => m.id);

  if (!eligibleVoters.length) {
    throw new Error("No eligible voters in this voice channel.");
  }

  const neededYes = Math.ceil(eligibleVoters.length / 2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("move_poll_yes")
      .setLabel("Yes")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("move_poll_no")
      .setLabel("No")
      .setStyle(ButtonStyle.Danger)
  );

  const textChannel =
    guild.systemChannel ||
    guild.channels.cache.find((c) => c.type === ChannelType.GuildText);

  if (!textChannel) {
    throw new Error("No text channel available to post the poll.");
  }

  const pollMsg = await textChannel.send({
    content:
      `Vote: Move ${target} from ${vc} to ${loopChannel}? ` +
      `Eligible voters: ${eligibleVoters.length} (need ${neededYes} yes). Voting ends in 60s.`,
    components: [row]
  });

  const votes = new Map(); // voterId -> "yes" | "no"

  const collector = pollMsg.createMessageComponentCollector({
    time: 60 * 1000
  });

  collector.on("collect", async (btnInt) => {
    const voterId = btnInt.user.id;

    if (!eligibleVoters.includes(voterId)) {
      return btnInt.reply({
        content: "You are not eligible to vote in this poll.",
        ephemeral: true
      });
    }

    const choice = btnInt.customId === "move_poll_yes" ? "yes" : "no";
    votes.set(voterId, choice);

    await btnInt.reply({ content: "Vote recorded.", ephemeral: true });
  });

  collector.on("end", async () => {
    const yes = [...votes.values()].filter((v) => v === "yes").length;
    const no = [...votes.values()].filter((v) => v === "no").length;

    const passed = yes >= neededYes;

    let result =
      `Poll ended. Yes: ${yes}, No: ${no}. ` +
      (passed ? "Result: YES." : "Result: NO.");

    if (passed) {
      try {
        const freshTarget = await guild.members.fetch(targetId);
        const stillInVc = freshTarget.voice?.channelId === vc.id;

        if (!stillInVc) {
          result += " Poll passed, but member left the voice channel.";
        } else {
          await freshTarget.voice.setChannel(loopChannel.id, "Move-by-vote passed");

          try {
            await freshTarget.send({
              content: `You were moved to ${loopChannel.name} after a vote in ${vc.name}.`,
              files: [new AttachmentBuilder(pickRandomGif())]
            });
          } catch {
            // DM failures are common; ignore
          }

          result += " Member moved.";
        }
      } catch (err) {
        result += " Poll passed, but move failed (permissions/state).";
      }
    }

    await pollMsg.edit({ content: result, components: [] });
  });

  return { pollMessageId: pollMsg.id, eligibleCount: eligibleVoters.length };
}

module.exports = { startMovePoll };
