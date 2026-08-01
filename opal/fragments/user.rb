class Movie < Sequel::Model
  plugin :swill
  plugin :privacy

  client_commands do
    def mark_watched
      update(watched: true)
    end

    § verdict: T.enum('favorite', 'liked', 'neutral', 'disliked')
    def update_verdict(verdict:)
      update(verdict: verdict)
    end
  end

  client_dataset_methods do
    def unwatched
      where(watched: false)
    end
  end
end

# All of these things would be blocking and synchronous,
# so we'll have to think about how to fix that.
#
movie = Movie.unwatched.first

Movie.unwatched.first.__await__

# On the client
movie.mark_watched
movie.update_verdict('favorite')

# communicates with server that attahes the viewer_context

mailing_list.add_member(member)
mailing_list.add_email('arbales@me.com')
