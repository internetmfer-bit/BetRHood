import { getBio, getFollowerCount, getFollowingCount, getProfile, getProfilePicture } from "@betrhood/sdk";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { FollowButton } from "../components/FollowButton";
import { PostCard } from "../components/PostCard";
import { getOwnSocialPosts, type FeedItem } from "../social";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      name: string;
      bio: string;
      pictureUrl: string | null;
      // null means "couldn't load" (e.g. Follow.sol not deployed yet) — the rest of the
      // profile still renders fine, this section just doesn't show.
      followerCount: bigint | null;
      followingCount: bigint | null;
      // null means "couldn't load" — the Posts section just doesn't show, same as above.
      posts: FeedItem[] | null;
      postNames: Record<string, string>;
    };

export function ProfileView() {
  const { address } = useParams<{ address: string }>();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!publicClient || !address) return;
    if (!isAddress(address)) {
      setState({ status: "error", message: `"${address}" is not a valid address` });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });

    (async () => {
      try {
        const owner = address as Address;
        const [profile, bio] = await Promise.all([getProfile(publicClient, owner), getBio(publicClient, owner)]);
        if (cancelled) return;

        // Separate from the main load — a Follow.sol hiccup shouldn't take down the whole
        // profile page, it should just mean this one section doesn't show.
        let followerCount: bigint | null = null;
        let followingCount: bigint | null = null;
        try {
          [followerCount, followingCount] = await Promise.all([
            getFollowerCount(publicClient, owner),
            getFollowingCount(publicClient, owner),
          ]);
        } catch {
          // leave both null
        }
        if (cancelled) return;

        // Same non-fatal treatment as follower/following counts above.
        let posts: FeedItem[] | null = null;
        let postNames: Record<string, string> = {};
        try {
          posts = await getOwnSocialPosts(publicClient, owner);
          const originalSenders = [...new Set(posts.filter((i) => i.original).map((i) => i.original!.sender))];
          const entries = await Promise.all(
            originalSenders.map(async (sender): Promise<[Address, string]> => {
              const profile = await getProfile(publicClient, sender);
              return [sender, profile.name];
            }),
          );
          postNames = Object.fromEntries(entries.filter(([, name]) => name.length > 0));
          // This profile's own posts/reposts always show `owner` as a sender too (the
          // reposter, for a repost) — include their own name so it resolves the same way.
          if (profile.name) postNames[owner] = profile.name;
        } catch {
          // leave posts null
        }
        if (cancelled) return;

        let pictureUrl: string | null = null;
        if (profile.hasPicture) {
          const bytes = await getProfilePicture(publicClient, owner);
          if (!cancelled && bytes) {
            objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
            pictureUrl = objectUrl;
          }
        }
        if (!cancelled) {
          setState({
            status: "ready",
            name: profile.name,
            bio,
            pictureUrl,
            followerCount,
            followingCount,
            posts,
            postNames,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publicClient, address, reloadKey]);

  if (!address) return null;

  return (
    <div className="panel">
      {state.status === "loading" && <p className="hint">Loading…</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}

      {state.status === "ready" && (
        <>
          {state.pictureUrl ? (
            <img src={state.pictureUrl} alt="" className="avatar" />
          ) : (
            <span className="avatar avatar-empty" />
          )}
          <h1>{state.name || truncate(address)}</h1>
          <p className="hint">{address}</p>
          {state.followerCount !== null && state.followingCount !== null && (
            <p className="follow-counts">
              <b>{state.followerCount.toString()}</b> followers · <b>{state.followingCount.toString()}</b> following
            </p>
          )}
          {state.bio && <p className="profile-bio">{state.bio}</p>}
          <FollowButton target={address as Address} onChange={() => setReloadKey((k) => k + 1)} />

          {state.posts !== null && state.posts.length > 0 && (
            <div className="upload-history">
              <h2 className="upload-history-title">Posts</h2>
              <div className="post-card-list">
                {state.posts.map((item) => (
                  <PostCard key={item.post.id.toString()} item={item} names={state.postNames} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
