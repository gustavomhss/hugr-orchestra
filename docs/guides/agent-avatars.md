# Agent avatars

Every agent can show a picture on its card in **Agents**. The native seats come with their own portraits. Any agent,
native or one you made, can take a picture from the library or one you upload.

## Pick or upload an avatar

1. Open **Agents** and click the agent to open its screen ([The agent screen](agent-screen.md)), or create a new one.
2. Under **Avatar**, do one of these:
   - Click a picture in the library.
   - Choose **Upload image** and pick a PNG, JPEG or WebP file. The app crops it to a square and shrinks it to
     192 pixels before saving.
   - Choose **Use default** to go back to the seat's own portrait, or to the plain mark for an agent you made.
3. Save. On the agent screen, use **Save** in the bar at the bottom.

SVG files are refused, because an SVG can carry script.

## While an agent works

While any of an agent's sessions in the open folder is running, its picture on the card and on its screen glows in
blue along the figure's outline and slowly brightens and dims. With the system's Reduce Motion setting on, the glow
stays still.

## Where it is stored

The choice is saved in the agent's file under `.orchestra/agent/<id>.md`, as the `avatar` key in its front matter:

- `avatar: lib:set2-07` names a library picture.
- An uploaded image is stored inline as a `data:image/webp;base64,...` value of at most 200,000 characters.

You can edit the key by hand. A value that is neither of these makes the file fail to load, as any other invalid key
does.
