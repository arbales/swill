# frozen_string_literal: true

require "minitest/autorun"
require_relative "../rb/swill/slim"

class SlimTest < Minitest::Test
  def test_toolbar_sketch_renders_swill_markup
    template = Swill::Slim.from_file(File.expand_path("fixtures/slim_exploration.slim", __dir__), namespace: "Movies")
    html = template.render
    assert_includes html, '<header class="toolbar" klass="Movies::Menubar" outlet="menubar">'
    assert_includes html,
                    '<button bind-hidden="guest" data-action="new_movie" ' \
                    'klass="Swill::Control::Button" outlet="new_movie_button">'
    assert_includes html,
                    '<button bind-disabled="selected_movie.nil?" bind-hidden="guest" ' \
                    'data-action="edit_movie" klass="Swill::Control::Button">'
    assert_includes html, 'New Movie <kbd>N</kbd>'
  end

  def test_reusable_server_template_keeps_slim_locals_and_html_escaping
    template = Swill::Slim.from_source('Menubar element="header" title=title = label', namespace: "Movies")
    assert_includes template.render(nil, title: "A & B", label: "First"), 'title="A &amp; B">First</header>'
    assert_includes template.render(nil, title: "Next", label: "Second"), 'title="Next">Second</header>'
  end

  def test_binding_shorthand_is_literal_and_native_form_action_is_preserved
    source = <<~SLIM
      form action="/save"
        Swill::Control::Select bind="priority"
        p hidden~="@preview.plot.blank?" Plot
    SLIM
    html = Swill::Slim.from_source(source, namespace: "Movies").render
    assert_includes html, '<form action="/save">'
    assert_includes html, '<select bind="priority" klass="Swill::Control::Select"></select>'
    assert_includes html, '<p bind-hidden="@preview.plot.blank?">Plot</p>'
    assert_raises(ArgumentError) do
      Swill::Slim.from_source('p hidden~=(guest) Text', namespace: "Movies")
    end
    assert_raises(ArgumentError) do
      Swill::Slim.from_source("p hidden~=\"\#{guest}\" Text", namespace: "Movies")
    end
  end

  def test_class_names_need_valid_namespace_and_can_override_native_tag
    assert_includes Swill::Slim.from_source('Menubar element="nav"', namespace: "Movies").render,
                    '<nav klass="Movies::Menubar"></nav>'
    assert_includes Swill::Slim.from_source('Editor::Toolbar', namespace: "Movies").render,
                    '<div klass="Movies::Editor::Toolbar"></div>'
    assert_raises(ArgumentError) { Swill::Slim.from_source('Menubar', namespace: "") }
    assert_raises(ArgumentError) { Swill::Slim.from_source('Menubar element="script!"', namespace: "Movies") }
  end

  def test_plain_slim_remains_unconfigured
    assert_equal '<Menubar></Menubar>', ::Slim::Template.new { 'Menubar' }.render
  end
end
